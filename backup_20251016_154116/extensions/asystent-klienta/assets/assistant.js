(function(){
  const elForm = document.getElementById('assistant-form');
  const elInput = document.getElementById('assistant-input');
  const elMsgs = document.getElementById('assistant-messages');

  function addMsg(role, text){
    const div = document.createElement('div');
    div.className = 'msg msg-' + role;
    div.textContent = text;
    elMsgs.appendChild(div);
    elMsgs.scrollTop = elMsgs.scrollHeight;
  }

  elForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = elInput.value.trim();
    if(!text) return;
    addMsg('user', text);
    elInput.value = '';

    try {
      const res = await fetch('/apps/assistant/chat', {
        method:'POST',
        headers:{'content-type':'application/json'},
        body: JSON.stringify({ message: text, session_id: localStorage.getItem('epir_session') || null })
      });
      const data = await res.json();
      if(data && data.reply){ addMsg('assistant', data.reply); }
      if(data && data.session_id){ localStorage.setItem('epir_session', data.session_id); }
    } catch(err){
      addMsg('assistant', 'Przepraszam, wystąpił błąd.');
    }
  });
})();
