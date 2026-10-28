'use strict';
const adminDialog=document.querySelector('#settingsDialog');
const adminStatus=message=>{document.querySelector('#adminStatus').textContent=message;};
const storage={get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){localStorage.setItem(key,value);},remove(key){try{localStorage.removeItem(key);}catch{}}};
async function passwordDigest(password,salt){
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bytes=await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:120000,hash:'SHA-256'},material,256);
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function adminRow(product){
 const row=document.createElement('div');row.className='admin-card admin-row';row.dataset.id=product.id;
 const grid=document.createElement('div');grid.className='admin-grid';
 const addInput=(labelText,name,type,value,container=grid)=>{
  const label=document.createElement('label');label.textContent=labelText;
  const input=document.createElement('input');input.name=name;input.type=type;input.value=value??'';
  if(name==='name'){input.required=true;input.maxLength=100;}
  if(name==='price'){input.required=true;input.min='1';input.max='1000000';input.step='1';}
  label.append(input);container.append(label);return input;
 };
 addInput('商品名','name','text',product.name);addInput('単価（税込・円）','price','number',product.price);row.append(grid);
 const checkLabel=document.createElement('label');checkLabel.className='check';
 const check=document.createElement('input');check.type='checkbox';check.name='available';check.checked=product.available!==false;checkLabel.append(check,document.createTextNode('販売中（外すと準備中）'));row.append(checkLabel);
 addInput('商品画像URL（任意）','image','text',product.image,row);
 addInput('梱包写真URL（任意）','detailImage','text',product.detailImage,row);
 const fileLabel=document.createElement('label');fileLabel.textContent='商品写真を選ぶ（任意・JPEG／PNG／WebP、1MBまで）';
 const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';fileLabel.append(file);row.append(fileLabel);
 file.addEventListener('change',async()=>{
  const selected=file.files[0];if(!selected)return;
  if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>1048576){adminStatus('画像はJPEG・PNG・WebP、1MB以下にしてください。');file.value='';return;}
  const reader=new FileReader();reader.onload=()=>{row.querySelector('[name="image"]').value=reader.result;adminStatus('写真を読み込みました。「この端末に保存・表示」で確認できます。');};reader.readAsDataURL(selected);
 });
 const remove=document.createElement('button');remove.type='button';remove.className='small-button';remove.textContent='この商品を削除';remove.style.marginTop='14px';remove.addEventListener('click',()=>row.remove());row.append(remove);
 return row;
}
function renderAdmin(){const list=document.querySelector('#adminProducts');list.replaceChildren(...PRODUCTS.map(adminRow));}
function readEditor(){
 const items=[...document.querySelectorAll('#adminProducts .admin-row')].map(row=>({id:row.dataset.id,name:row.querySelector('[name="name"]').value,price:Number(row.querySelector('[name="price"]').value),available:row.querySelector('[name="available"]').checked,image:row.querySelector('[name="image"]').value.trim(),detailImage:row.querySelector('[name="detailImage"]').value.trim()}));
 return validateProducts(items);
}
function catalogSource(items){return 'window.ORDER_CATALOG = '+JSON.stringify({version:1,updatedAt:new Date().toISOString(),products:items},null,2)+';\n';}
function allowAdmin(){
 adminUnlocked=true;document.querySelector('#adminLogin').hidden=true;document.querySelector('#adminContent').hidden=false;
 const draft=storage.get(SETTINGS_KEY);
 if(draft){try{applyCatalog(JSON.parse(draft),true);}catch{storage.remove(SETTINGS_KEY);}}
 renderAdmin();
}
document.querySelector('#openSettings').addEventListener('click',()=>{
 if(submitting){return;}
 if(completed){return;}
 document.querySelector('#loginStatus').textContent='';document.querySelector('#adminPassword').value='';
 document.querySelector('#adminLogin').hidden=adminUnlocked;document.querySelector('#adminContent').hidden=!adminUnlocked;
 if(adminUnlocked)renderAdmin();adminDialog.showModal();
});
document.querySelector('#closeSettings').addEventListener('click',()=>adminDialog.close());
adminDialog.addEventListener('close',()=>{document.querySelector('#githubToken').value='';document.querySelector('#adminPassword').value='';});
document.querySelector('#adminLogin').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.querySelector('#adminPassword');
 try{
  const saved=storage.get(PASSWORD_KEY),record=saved?JSON.parse(saved):null;
  const matches=record?await passwordDigest(input.value,record.salt)===record.hash:input.value==='admin';
  input.value='';if(!matches){document.querySelector('#loginStatus').textContent='パスワードが違います。';return;}
  allowAdmin();
 }catch{document.querySelector('#loginStatus').textContent='設定を開けませんでした。ブラウザーの保存設定をご確認ください。';}
});
document.querySelector('#addProduct').addEventListener('click',()=>{
 const row=adminRow({id:'product_'+crypto.randomUUID().replaceAll('-',''),name:'',price:3600,available:true,image:'',detailImage:''});
 document.querySelector('#adminProducts').append(row);row.querySelector('[name="name"]').focus();
});
document.querySelector('#catalogForm').addEventListener('submit',event=>{
 event.preventDefault();if(!adminUnlocked)return;
 try{const items=readEditor();storage.set(SETTINGS_KEY,JSON.stringify(items));applyCatalog(items,true);adminStatus('この端末に保存して商品選択へ反映しました。お客様全員への反映には「サイト全体に公開」を実行してください。');}
 catch(error){adminStatus(error.message);}
});
document.querySelector('#discardDraft').addEventListener('click',()=>{
 storage.remove(SETTINGS_KEY);applyCatalog(window.ORDER_CATALOG?.products||DEFAULT_PRODUCTS,false);renderAdmin();adminStatus('公開中の商品設定に戻しました。');
});
document.querySelector('#changePassword').addEventListener('submit',async event=>{
 event.preventDefault();if(!adminUnlocked)return;
 const password=document.querySelector('#newPassword').value;
 if(password!==document.querySelector('#confirmPassword').value){adminStatus('新しいパスワードが一致しません。');return;}
 try{const salt=crypto.randomUUID(),hash=await passwordDigest(password,salt);storage.set(PASSWORD_KEY,JSON.stringify({salt,hash}));event.target.reset();adminStatus('このブラウザーの設定パスワードを変更しました。');}
 catch{adminStatus('パスワードを保存できませんでした。ブラウザーの保存設定をご確認ください。');}
});
document.querySelector('#lockSettings').addEventListener('click',()=>{adminUnlocked=false;document.querySelector('#adminContent').hidden=true;document.querySelector('#adminLogin').hidden=false;document.querySelector('#githubToken').value='';adminDialog.close();});
document.querySelector('#exportCatalog').addEventListener('click',()=>{
 if(!adminUnlocked)return;
 try{const source=catalogSource(readEditor()),url=URL.createObjectURL(new Blob([source],{type:'application/javascript;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='catalog.js';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);adminStatus('catalog.js を保存しました。GitHubの同名ファイルへアップロードすると全員に反映できます。');}catch(error){adminStatus(error.message);}
});
document.querySelector('#publishCatalog').addEventListener('click',async()=>{
 if(!adminUnlocked)return;
 const input=document.querySelector('#githubToken'),token=input.value.trim();
 if(!token){adminStatus('公開するにはGitHubトークンを入力してください。トークンを使わない場合は「公開用ファイルを保存」を使用してください。');input.focus();return;}
 let items;try{items=readEditor();}catch(error){adminStatus(error.message);return;}
 const button=document.querySelector('#publishCatalog');button.disabled=true;adminStatus('GitHubへ公開設定を保存しています…');
 const url='https://api.github.com/repos/yohaku1228/order-form/contents/catalog.js';
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 try{
  const current=await fetch(url,{headers,cache:'no-store'});
  let sha;if(current.ok){sha=(await current.json()).sha;}else if(current.status!==404){throw new Error('GitHubの認証に失敗しました。トークンの有効期限・対象リポジトリ・Contents権限を確認してください。');}
  const bytes=new TextEncoder().encode(catalogSource(items));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({message:'Update products and prices from settings',content:btoa(binary),branch:'main',...(sha?{sha}:{})})});
  if(!response.ok)throw new Error('公開設定を保存できませんでした。変更の競合、GitHubの認証・権限を確認して再試行してください。');
  window.ORDER_CATALOG={products:items};storage.remove(SETTINGS_KEY);applyCatalog(items,false);
  adminStatus('GitHubに保存しました。公開ページへの反映には1〜2分程度かかります。反映後に別の端末でも表示を確認してください。');
 }catch(error){adminStatus(error.message||'公開に失敗しました。時間をおいてお試しください。');}
 finally{input.value='';button.disabled=false;}
});

