'use strict';
// Phone test page served by the print relay at GET /. It holds no secrets: the pairing token comes from the
// link's #t=... part (never sent to the server) or is typed in. Same-origin, so no CORS is needed.
module.exports = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ทดสอบพิมพ์ POS ฉุกเฉิน</title>
<style>
body{margin:0;font:18px/1.4 system-ui,"Noto Sans Thai",Tahoma,sans-serif;background:#f1f4f8;color:#10243a}
main{max-width:460px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.3rem;margin:0 0 4px}
p{margin:6px 0;color:#4a6078}
label{display:block;font-weight:700;margin:16px 0 6px}
input{width:100%;box-sizing:border-box;font:inherit;padding:12px;border:1.5px solid #b3c1ce;border-radius:10px}
button{display:block;width:100%;font:inherit;font-weight:700;padding:16px;margin-top:12px;border:0;border-radius:12px;background:#0f7a55;color:#fff}
button.alt{background:#fff;color:#10243a;border:1.5px solid #b3c1ce}
button:disabled{opacity:.5}
#out{margin-top:18px;padding:14px;border-radius:12px;background:#fff;border:1.5px solid #d5dee8;min-height:3em;white-space:pre-wrap}
.ok{border-color:#0f7a55!important;color:#0a5c40}.bad{border-color:#c0392b!important;color:#a52a1d}
</style></head><body><main>
<h1>ทดสอบพิมพ์จากมือถือ</h1>
<p>หน้านี้ใช้ลองสั่งพิมพ์ที่เครื่องพิมพ์ของร้าน ยังไม่ใช่แอปขายจริง</p>
<label for="t">รหัสจับคู่</label>
<input id="t" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="วางรหัสจากหน้าตั้งค่าของเครื่อง POS">
<button id="ping" class="alt">1. ตรวจว่าเจอเครื่อง POS</button>
<button id="test">2. พิมพ์ใบทดสอบ</button>
<button id="bill">3. พิมพ์ใบเสร็จตัวอย่าง</button>
<div id="out" role="status">รอทดสอบ</div>
<script>
(function(){
  var $=function(i){return document.getElementById(i)};
  var m=/[#&]t=([0-9a-f]+)/.exec(location.hash); if(m)$('t').value=m[1];
  function show(t,c){var o=$('out');o.textContent=t;o.className=c||''}
  function call(method,path,body){
    var tok=$('t').value.trim();
    if(!tok){show('ใส่รหัสจับคู่ก่อน','bad');return Promise.resolve(null)}
    show('กำลังส่ง...');
    var bs=document.querySelectorAll('button');bs.forEach(function(b){b.disabled=true});
    return fetch(path,{method:method,headers:Object.assign({Authorization:'Bearer '+tok},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined})
      .then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{status:r.status,j:j}})})
      .catch(function(){return{status:0,j:{}}})
      .then(function(x){bs.forEach(function(b){b.disabled=false});return x});
  }
  function report(x,okText){
    if(!x)return;
    if(x.status===200&&x.j.ok)show(okText,'ok');
    else if(x.status===0)show('ติดต่อเครื่อง POS ไม่ได้ ตรวจว่ามือถืออยู่ Wi-Fi/ฮอตสปอตเดียวกับเครื่อง POS และโปรแกรมเปิดอยู่','bad');
    else if(x.status===401)show('รหัสจับคู่ไม่ถูกต้อง','bad');
    else show('ไม่สำเร็จ: '+(x.j.error||('รหัสตอบกลับ '+x.status)),'bad');
  }
  $('ping').onclick=function(){call('GET','/ping').then(function(x){report(x,'เจอเครื่อง POS แล้ว (เครื่อง '+(x&&x.j.machine)+')')})};
  $('test').onclick=function(){call('POST','/print-test').then(function(x){report(x,'ส่งใบทดสอบแล้ว ดูที่เครื่องพิมพ์')})};
  $('bill').onclick=function(){
    var b={machine:'MOB-TEST',cashier:'ทดสอบ',createdAt:new Date().toISOString(),total:65,
      lines:[{name:'ปลากระป๋อง',price:58,qty:1,discount:0},{name:'น้ำดื่ม',price:7,qty:1,discount:0}],
      payments:[{method:'cash',amount:100}],change:35};
    call('POST','/print',b).then(function(x){report(x,'ส่งใบเสร็จตัวอย่างแล้ว ดูที่เครื่องพิมพ์')});
  };
})();
</script></main></body></html>`;
