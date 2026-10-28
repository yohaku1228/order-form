'use strict';
const adminDialog=document.querySelector('#settingsDialog');
const adminStatus=message=>{document.querySelector('#adminStatus').textContent=message;};
let settingsSession='',catalogRevision=1;
async function settingsRequest(path,method='GET',body){
 const response=await fetch(CONFIG.settingsApi+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(settingsSession?{Authorization:'Bearer '+settingsSession}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
 const data=await response.json();if(!response.ok){const error=new Error(data.error||'接続できませんでした。');error.status=response.status;throw error;}return data;
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
 const picture=addInput('','image','hidden',product.image,row);picture.parentElement.hidden=true;
 const detail=addInput('','detailImage','hidden',product.detailImage,row);detail.parentElement.hidden=true;
 const fileLabel=document.createElement('label');fileLabel.textContent='商品写真を選ぶ（任意・JPEG／PNG／WebP、1MBまで）';
 const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';fileLabel.append(file);row.append(fileLabel);
 file.addEventListener('change',async()=>{
  const selected=file.files[0];if(!selected)return;
  if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>1048576){adminStatus('画像はJPEG・PNG・WebP、1MB以下にしてください。');file.value='';return;}
  const reader=new FileReader();reader.onload=()=>{row.querySelector('[name="image"]').value=reader.result;adminStatus('写真を読み込みました。「変更を保存」で反映されます。');};reader.readAsDataURL(selected);
 });
 const remove=document.createElement('button');remove.type='button';remove.className='small-button';remove.textContent='この商品を削除';remove.style.marginTop='14px';remove.addEventListener('click',()=>row.remove());row.append(remove);
 return row;
}
function renderAdmin(){const list=document.querySelector('#adminProducts');list.replaceChildren(...PRODUCTS.map(adminRow));}
function readEditor(){
 const items=[...document.querySelectorAll('#adminProducts .admin-row')].map(row=>({id:row.dataset.id,name:row.querySelector('[name="name"]').value,price:Number(row.querySelector('[name="price"]').value),available:row.querySelector('[name="available"]').checked,image:row.querySelector('[name="image"]').value.trim(),detailImage:row.querySelector('[name="detailImage"]').value.trim()}));
 return validateProducts(items);
}

function showLogin(){adminUnlocked=false;document.querySelector('#adminLogin').hidden=false;document.querySelector('#adminContent').hidden=true;}
document.querySelector('#openSettings').addEventListener('click',()=>{
 if(submitting)return;settingsSession='';document.querySelector('#adminPassword').value='';document.querySelector('#loginStatus').textContent='';adminStatus('');showLogin();adminDialog.showModal();
});
document.querySelector('#closeSettings').addEventListener('click',()=>adminDialog.close());
adminDialog.addEventListener('close',()=>{settingsSession='';adminUnlocked=false;document.querySelector('#adminPassword').value='';document.querySelector('#changePassword').reset();});
document.querySelector('#adminLogin').addEventListener('submit',async event=>{
 event.preventDefault();const input=document.querySelector('#adminPassword'),button=event.target.querySelector('button');
 button.disabled=true;document.querySelector('#loginStatus').textContent='確認しています…';
 try{
  const data=await settingsRequest('/admin/login','POST',{password:input.value});input.value='';settingsSession=data.token;catalogRevision=data.revision;
  applyCatalog(data.products,false);adminUnlocked=true;document.querySelector('#adminLogin').hidden=true;document.querySelector('#adminContent').hidden=false;renderAdmin();
 }catch(error){input.value='';document.querySelector('#loginStatus').textContent=error.message;}
 finally{button.disabled=false;}
});
document.querySelector('#addProduct').addEventListener('click',()=>{
 const row=adminRow({id:'product_'+crypto.randomUUID().replaceAll('-',''),name:'',price:3600,available:true,image:'',detailImage:''});document.querySelector('#adminProducts').append(row);row.querySelector('[name="name"]').focus();
});
document.querySelector('#catalogForm').addEventListener('submit',async event=>{
 event.preventDefault();if(!adminUnlocked)return;const button=document.querySelector('#saveCatalog');let products;
 try{products=readEditor();}catch(error){adminStatus(error.message);return;}
 button.disabled=true;adminStatus('保存しています…');
 try{const data=await settingsRequest('/catalog','PUT',{products,revision:catalogRevision});catalogRevision=data.revision;window.ORDER_CATALOG=data;applyCatalog(data.products,false);adminStatus('保存しました。お客様の画面にも反映されます。');}
 catch(error){adminStatus(error.message);if(error.status===401){settingsSession='';showLogin();document.querySelector('#loginStatus').textContent=error.message;}}
 finally{button.disabled=false;}
});
document.querySelector('#changePassword').addEventListener('submit',async event=>{
 event.preventDefault();if(!adminUnlocked)return;
 const password=document.querySelector('#newPassword').value;
 if(password!==document.querySelector('#confirmPassword').value){adminStatus('新しいパスワードが一致しません。');return;}
 const button=event.target.querySelector('button');button.disabled=true;
 try{await settingsRequest('/admin/password','POST',{password});event.target.reset();settingsSession='';showLogin();document.querySelector('#loginStatus').textContent='パスワードを変更しました。新しいパスワードで開いてください。';}
 catch(error){adminStatus(error.message);}finally{button.disabled=false;}
});

