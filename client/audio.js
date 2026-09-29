export class Audio {
  context=null;
  muted=false;
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if(this.context.state==='suspended') await this.context.resume();
    } catch { /* Audio support is optional; movement must remain available. */ }
  }
  play(layers) {
    const ctx=this.context;
    if(!ctx || ctx.state!=='running' || this.muted || !layers) return;
    for(const layer of layers.slice(0,12)) {
      const start=ctx.currentTime+Math.max(0,Math.min(5,layer.delay ?? 0));
      const duration=Math.max(.02,Math.min(5,layer.duration ?? .1));
      const gain=ctx.createGain();
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002,Math.min(.25,layer.gain ?? .05)),start+Math.min(.03,duration/4));
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      gain.connect(ctx.destination);
      let source,tail;
      if(layer.wave==='noise') {
        source=ctx.createBufferSource();
        const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate);
        const samples=buffer.getChannelData(0);
        for(let i=0;i<samples.length;i++) samples[i]=Math.random()*2-1;
        source.buffer=buffer;
        tail=ctx.createBiquadFilter();
        tail.type=layer.filter ?? 'lowpass';tail.Q.value=.8;
        tail.frequency.setValueAtTime(layer.frequency ?? 500,start);
        tail.frequency.exponentialRampToValueAtTime(Math.max(20,layer.endFrequency ?? 100),start+duration);
        source.connect(tail);tail.connect(gain);
      } else {
        source=ctx.createOscillator();source.type=layer.wave ?? 'sine';
        source.frequency.setValueAtTime(layer.frequency ?? 100,start);
        source.frequency.exponentialRampToValueAtTime(Math.max(20,layer.endFrequency ?? 50),start+duration);
        source.connect(gain);
      }
      source.onended=()=>{source.disconnect();tail?.disconnect();gain.disconnect();};
      source.start(start);source.stop(start+duration);
    }
  }
}
