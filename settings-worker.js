const ORIGIN='https://yohaku1228.github.io';
const DEFAULT_CATALOG=[{id:'lafrance3',name:'ラ・フランス 3kg 化粧箱',price:3600,available:true,image:'assets/lafrance-orchard.jpg',detailImage:'assets/lafrance-box.jpg'}];
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
async function hashPassword(password,salt){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const result=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256);
 return Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('');
}
function safeEqual(a,b){let difference=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return difference===0;}
export function validateCatalog(items){
 if(!Array.isArray(items)||items.length<1||items.length>50)throw new Error('商品は1〜50件にしてください。');
 const ids=new Set();
 const image=value=>{if(!value)return '';if(typeof value!=='string'||value.length>1500000||!(/^(assets\/[a-zA-Z0-9._/-]+|https:\/\/[^\s]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(value)))throw new Error('写真の形式を確認してください。');return value;};
 const products=items.map(p=>{
  if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||ids.has(p.id))throw new Error('商品IDを確認してください。');ids.add(p.id);
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!Number.isSafeInteger(p.price)||p.price<1||p.price>1000000)throw new Error('商品名・単価を確認してください。');
  return {id:p.id,name:p.name.trim(),price:p.price,available:p.available!==false,image:image(p.image),detailImage:image(p.detailImage)};
 });
 if(!products.some(p=>p.available))throw new Error('販売中の商品を1件以上にしてください。');
 if(new TextEncoder().encode(JSON.stringify(products)).length>1700000)throw new Error('写真の合計サイズを小さくしてください。');
 return products;
}
async function initialize(db){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS catalog (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, products TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS admin_password (id INTEGER PRIMARY KEY, salt TEXT NOT NULL, digest TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires INTEGER NOT NULL)')
 ]);
 await db.prepare('INSERT OR IGNORE INTO catalog (id,revision,products) VALUES (1,1,?)').bind(JSON.stringify(DEFAULT_CATALOG)).run();
}
async function getCatalog(db){const data=await db.prepare('SELECT revision,products FROM catalog WHERE id=1').first();return {revision:data.revision,products:JSON.parse(data.products)};}
async function readJson(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw new Error('入力形式を確認してください。');
 const reader=request.body?.getReader();if(!reader)throw new Error('入力がありません。');
 let size=0;const parts=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1900000){await reader.cancel();throw new Error('写真サイズを小さくしてください。');}parts.push(value);}
 const bytes=new Uint8Array(size);let cursor=0;for(const part of parts){bytes.set(part,cursor);cursor+=part.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('入力形式を確認してください。');}
}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(origin===ORIGIN||origin===url.origin)headers['Access-Control-Allow-Origin']=origin;
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(request.method==='OPTIONS'){
   if(origin!==ORIGIN&&origin!==url.origin)return reply({error:'許可されていません。'},403);
   return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}});
  }
  if(!['/catalog','/admin/login','/admin/password'].includes(url.pathname))return reply({error:'Not found'},404);
  if(!env.DB)return reply({error:'設定を準備しています。'},503);
  try{
   await initialize(env.DB);
   if(request.method==='GET'&&url.pathname==='/catalog')return reply(await getCatalog(env.DB));
   if(origin!==ORIGIN&&origin!==url.origin)return reply({error:'許可されていません。'},403);
   if(url.pathname==='/admin/login'&&request.method==='POST'){
    const body=await readJson(request);if(typeof body.password!=='string'||body.password.length>256)return reply({error:'パスワードを確認してください。'},400);
    const now=Date.now(),bucket=await sha((request.headers.get('CF-Connecting-IP')||'unknown')+'|'+Math.floor(now/300000));
    const limit=await env.DB.prepare('INSERT INTO login_attempts (bucket,attempts,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,now+300000).first();
    if(limit.attempts>8)return reply({error:'5分ほど待ってから、もう一度お試しください。'},429);
    let record=await env.DB.prepare('SELECT salt,digest FROM admin_password WHERE id=1').first();
    if(!record){const salt=crypto.randomUUID(),digest=await hashPassword('admin',salt);await env.DB.prepare('INSERT OR IGNORE INTO admin_password (id,salt,digest) VALUES (1,?,?)').bind(salt,digest).run();record=await env.DB.prepare('SELECT salt,digest FROM admin_password WHERE id=1').first();}
    if(!safeEqual(await hashPassword(body.password,record.salt),record.digest))return reply({error:'パスワードが違います。'},401);
    const token=crypto.randomUUID()+crypto.randomUUID();
    await env.DB.prepare('INSERT INTO admin_sessions (token_hash,expires) VALUES (?,?)').bind(await sha(token),now+3600000).run();
    await env.DB.batch([env.DB.prepare('DELETE FROM admin_sessions WHERE expires<?').bind(now),env.DB.prepare('DELETE FROM login_attempts WHERE expires<?').bind(now)]);
    return reply({token,...await getCatalog(env.DB)});
   }
   const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
   if(token.length>200)return reply({error:'もう一度パスワードを入力してください。'},401);
   const session=await env.DB.prepare('SELECT expires FROM admin_sessions WHERE token_hash=?').bind(await sha(token)).first();
   if(!session||session.expires<Date.now())return reply({error:'もう一度パスワードを入力してください。'},401);
   if(url.pathname==='/catalog'&&request.method==='PUT'){
    const body=await readJson(request),products=validateCatalog(body.products);
    if(!Number.isSafeInteger(body.revision))return reply({error:'ページを再読み込みしてください。'},400);
    const result=await env.DB.prepare('UPDATE catalog SET products=?,revision=revision+1 WHERE id=1 AND revision=? RETURNING revision').bind(JSON.stringify(products),body.revision).first();
    if(!result)return reply({error:'別の画面で変更されています。設定を開き直してから保存してください。'},409);
    return reply({products,revision:result.revision});
   }
   if(url.pathname==='/admin/password'&&request.method==='POST'){
    const body=await readJson(request);if(typeof body.password!=='string'||body.password.length<6||body.password.length>256)return reply({error:'パスワードは6〜256文字で設定してください。'},400);
    const salt=crypto.randomUUID(),digest=await hashPassword(body.password,salt);
    await env.DB.batch([env.DB.prepare('UPDATE admin_password SET salt=?,digest=? WHERE id=1').bind(salt,digest),env.DB.prepare('DELETE FROM admin_sessions')]);
    return reply({ok:true});
   }
   return reply({error:'Not found'},404);
  }catch(error){if(error.message?.includes('してください')||error.message?.includes('ありません'))return reply({error:error.message},400);console.error('Settings request failed');return reply({error:'保存先に接続できません。時間をおいてお試しください。'},503);}
 }
};

