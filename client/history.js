export function setupHistory(request) {
  const dialog=document.getElementById('history-panel'),body=document.getElementById('history-body');
  let generation=0;
  const open=title=>{
    generation++;document.getElementById('history-title').textContent=title;
    body.replaceChildren();if(!dialog.open) dialog.showModal();return generation;
  };
  const current=id=>dialog.open&&id===generation;
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
  const error=(id,reason)=>{if(current(id)) body.replaceChildren(text('p',reason.message));};
  document.getElementById('history-close').onclick=()=>dialog.close();
  async function show(offset=0) {
    const id=open('Game history');body.append(text('p','Reading local commits…'));
    try {
      const data=await request(`history?offset=${offset}`);
      if(!current(id)) return;
      body.replaceChildren(text('p',data.dirty?'A development is in progress; it will appear here when committed.':'Committed changes to this dungeon.'));
      const list=document.createElement('ol');list.className='commit-list';
      for(const commit of data.commits) {
        const item=document.createElement('li');
        item.append(text('strong',commit.subject),text('small',`${commit.hash.slice(0,8)} · ${new Date(commit.date).toLocaleString()}`));
        list.append(item);
      }
      body.append(list);
      const nav=document.createElement('div');nav.className='controls';
      for(const [label,page] of [['Newer',offset?Math.max(0,offset-30):null],['Older',data.next]]) {
        const button=text('button',label);button.disabled=page===null;button.onclick=()=>show(page);nav.append(button);
      }
      body.append(nav);
    } catch(reason) {error(id,reason);}
  }
  document.getElementById('history').onclick=()=>show();
}
