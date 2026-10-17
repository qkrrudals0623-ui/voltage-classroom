/* Bridge loaded inside the original experiment closure. */
const classroom = {code:'',group:null,token:'',busy:false,joined:false};
const classroomBar=document.createElement('div');
classroomBar.style.cssText='position:sticky;top:0;z-index:99;background:#244638;color:white;padding:12px 20px;font:16px sans-serif;';
classroomBar.textContent='수업에 참여하면 실험 과정이 교사에게 전송됩니다.';
document.body.prepend(classroomBar);
const joinPanel=document.createElement('div');
joinPanel.style.cssText='position:fixed;inset:0;z-index:200;background:#edf1eb;display:grid;place-items:center;font:18px sans-serif';
joinPanel.innerHTML='<form style="background:white;padding:32px;border-radius:20px;width:min(440px,95vw)"><h1>수업 참여</h1><label>6자리 참여 코드<br><input name="code" inputmode="numeric" pattern="[0-9]{6}" required style="font:inherit;padding:12px;width:100%;box-sizing:border-box"></label><p>다음 화면에서 우리 조를 선택하세요.</p><button style="background:#315e4e;color:white;padding:14px;border:0;border-radius:10px;font:inherit">참여하기</button><p role="alert" id="joinError"></p></form>';
document.body.append(joinPanel);
joinPanel.querySelector('input').value=new URLSearchParams(location.search).get('code')||'';
joinPanel.querySelector('form').onsubmit=e=>{e.preventDefault();classroom.code=joinPanel.querySelector('input').value;joinPanel.remove();};
document.querySelectorAll('[data-group]').forEach(button=>{
  // Capture first; original listener executes only after server accepts ownership.
  button.addEventListener('click',async e=>{
    if(classroom.joined)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(classroom.busy)return;
    classroom.busy=true;
    const group=Number(button.dataset.group), key='classroom:'+classroom.code+':'+group;
    try {
      const saved=JSON.parse(localStorage.getItem(key)||'{}');
      const r=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:classroom.code,group,token:saved.token||''})});
      const data=await r.json();if(!r.ok)throw Error(data.error);
      Object.assign(classroom,{group,token:data.token,joined:true});
      localStorage.setItem(key,JSON.stringify({token:data.token}));
      if(data.state.points){live.points=data.state.points;nextBatteryCount=data.state.step||0;renderRecords();}
      for(const id of ['answer1','answer2'])document.getElementById(id).value=data.state[id]||'';
      button.click();
      classroomBar.textContent=classroom.code+' · '+group+'조 · 교사에게 연결 중';
    }catch(err){alert(err.message);}finally{classroom.busy=false;}
  },true);
});
async function classroomSync(){
  if(!classroom.joined||classroom.busy)return;
  classroom.busy=true;
  try{
    const stateSnapshot={voltage:document.getElementById('voltageValue').textContent,current:document.getElementById('currentValue').textContent,status:document.getElementById('statusText').textContent,connected:state.isConnected&&voltageSensor.connected,step:nextBatteryCount,points:live.points.slice(0,1000).map(p=>({x:p.x,y:p.y})),answer1:document.getElementById('answer1').value,answer2:document.getElementById('answer2').value};
    const r=await fetch('/api/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:classroom.code,group:classroom.group,token:classroom.token,state:stateSnapshot}),signal:AbortSignal.timeout(8000)});
    const data=await r.json();if(!r.ok)throw Error(data.error);
    classroomBar.textContent=classroom.code+' · '+classroom.group+'조 · 전송 완료 '+new Date().toLocaleTimeString('ko-KR');
  }catch(err){classroomBar.textContent='전송 대기 · '+err.message+' (연결되면 자동 재전송)';}
  finally{classroom.busy=false;}
}
setInterval(classroomSync,1000);
if(!window.isSecureContext)classroomBar.textContent='블루투스 센서 연결에는 HTTPS 주소가 필요합니다.';
