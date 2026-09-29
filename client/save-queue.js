// Keep at most one request in flight and one latest snapshot. Holding a movement
// key during a slow connection must not retain thousands of cloned worlds.
export function createSaveQueue(write) {
  let pending=null,running=null;
  return {
    enqueue(snapshot) {
      pending=snapshot;
      if(!running) running=Promise.resolve().then(async()=>{
        let failure;
        while(pending!==null) {
          const next=pending;pending=null;
          try {await write(next);failure=null;} catch(error) {failure=error;}
        }
        if(failure) throw failure;
      }).finally(()=>{running=null;});
      return running;
    },
  };
}
