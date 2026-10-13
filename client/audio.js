// One-shot sounds are arrays of layers. An ambience is a bed of layers that
// runs until the game names a different one, plus sparse one-shots over it:
//   { id, layers: [{ wave, frequency, gain, filter, q, lfo: { rate, depth, on } }],
//     events: [{ sound: [layers], every: [minSeconds, maxSeconds] }] }
// `wave` may be sine/triangle/sawtooth/square or white/pink/brown noise.
const clamp=(value,low,high,fallback)=>Number.isFinite(value)?Math.max(low,Math.min(high,value)):fallback;

export class Audio {
  context=null;
  muted=false;
  bed=null;
  wanted=null;
  buffers=new Map();
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if(this.context.state==='suspended') await this.context.resume();
      if(this.wanted && this.wanted.id!==this.bed?.id) this.ambient(this.wanted);
    } catch { /* Audio support is optional; movement must remain available. */ }
  }
  noise(color='white',seconds=4) {
    const ctx=this.context,id=`${color}:${seconds}`;
    if(this.buffers.has(id)) return this.buffers.get(id);
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate),samples=buffer.getChannelData(0);
    let last=0,b0=0,b1=0,b2=0;
    for(let i=0;i<samples.length;i++) {
      const white=Math.random()*2-1;
      if(color==='brown') {last=(last+.02*white)/1.02;samples[i]=last*3.5;}
      else if(color==='pink') {b0=.99765*b0+white*.099046;b1=.963*b1+white*.2965164;b2=.57*b2+white*1.0526913;samples[i]=(b0+b1+b2+white*.1848)*.2;}
      else samples[i]=white;
    }
    this.buffers.set(id,buffer);return buffer;
  }
  play(layers) {
    const ctx=this.context;
    if(!ctx || ctx.state!=='running' || this.muted || !layers) return;
    for(const layer of layers.slice(0,12)) {
      const start=ctx.currentTime+clamp(layer.delay,0,5,0);
      const duration=clamp(layer.duration,.02,6,.1);
      const gain=ctx.createGain();
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.exponentialRampToValueAtTime(clamp(layer.gain,.0002,.25,.05),start+Math.min(clamp(layer.attack,.005,3,.03),duration/2));
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      gain.connect(ctx.destination);
      let source,tail;
      if(/noise|white|pink|brown/.test(layer.wave)) {
        source=ctx.createBufferSource();
        source.buffer=this.noise(layer.wave==='noise'?'white':layer.wave);
        source.loop=true;
        tail=ctx.createBiquadFilter();
        tail.type=layer.filter ?? 'lowpass';tail.Q.value=clamp(layer.q,.1,20,.8);
        tail.frequency.setValueAtTime(clamp(layer.frequency,20,12000,500),start);
        tail.frequency.exponentialRampToValueAtTime(clamp(layer.endFrequency ?? layer.frequency,20,12000,100),start+duration);
        source.connect(tail);tail.connect(gain);
      } else {
        source=ctx.createOscillator();source.type=layer.wave ?? 'sine';
        source.frequency.setValueAtTime(clamp(layer.frequency,20,12000,100),start);
        source.frequency.exponentialRampToValueAtTime(clamp(layer.endFrequency ?? layer.frequency,20,12000,50),start+duration);
        source.connect(gain);
      }
      source.onended=()=>{source.disconnect();tail?.disconnect();gain.disconnect();};
      source.start(start);source.stop(start+duration);
    }
  }
  // Cross-fade to the named ambience. Calling it again with the same id is free.
  ambient(spec) {
    this.wanted=spec ?? null;
    const ctx=this.context;
    if(!ctx || ctx.state!=='running') return;
    if((spec?.id ?? null)===(this.bed?.id ?? null)) return;
    const old=this.bed,now=ctx.currentTime;
    if(old) {
      old.alive=false;clearTimeout(old.timer);
      old.master.gain.cancelScheduledValues(now);old.master.gain.setTargetAtTime(.0001,now,1.2);
      setTimeout(()=>{for(const node of old.nodes) {try {node.stop?.();} catch { /* already stopped */ } node.disconnect();}},7000);
    }
    this.bed=null;
    if(!spec) return;
    const bed={id:spec.id,alive:true,nodes:[],timer:null,master:ctx.createGain()};
    bed.master.gain.setValueAtTime(.0001,now);
    bed.master.gain.setTargetAtTime(this.muted?.0001:clamp(spec.gain,0,1,1),now,1.6);
    bed.master.connect(ctx.destination);bed.nodes.push(bed.master);
    for(const layer of (spec.layers ?? []).slice(0,10)) {
      const gain=ctx.createGain();gain.gain.value=clamp(layer.gain,0,.3,.04);gain.connect(bed.master);
      let source,pitch;
      if(/noise|white|pink|brown/.test(layer.wave)) {
        source=ctx.createBufferSource();source.buffer=this.noise(layer.wave==='noise'?'white':layer.wave);source.loop=true;
        const filter=ctx.createBiquadFilter();
        filter.type=layer.filter ?? 'lowpass';filter.Q.value=clamp(layer.q,.1,20,.7);
        filter.frequency.value=clamp(layer.frequency,20,12000,600);
        source.connect(filter);filter.connect(gain);bed.nodes.push(filter);pitch=filter.frequency;
      } else {
        source=ctx.createOscillator();source.type=layer.wave ?? 'sine';
        source.frequency.value=clamp(layer.frequency,20,8000,80);source.detune.value=clamp(layer.detune,-1200,1200,0);
        source.connect(gain);pitch=source.frequency;
      }
      if(layer.lfo) {
        const lfo=ctx.createOscillator(),depth=ctx.createGain(),onPitch=layer.lfo.on==='frequency';
        lfo.frequency.value=clamp(layer.lfo.rate,.01,12,.1);
        depth.gain.value=onPitch?clamp(layer.lfo.depth,0,4000,20):gain.gain.value*clamp(layer.lfo.depth,0,1,.5);
        lfo.connect(depth);depth.connect(onPitch?pitch:gain.gain);lfo.start();bed.nodes.push(lfo,depth);
      }
      source.start();bed.nodes.push(source,gain);
    }
    const events=(spec.events ?? []).slice(0,6);
    const schedule=event=>{
      const [low,high]=event.every ?? [8,20];
      bed.timer=setTimeout(()=>{
        if(!bed.alive) return;
        this.play(event.sound);schedule(event);
      },1000*(clamp(low,.5,600,8)+Math.random()*Math.max(0,clamp(high,.5,600,20)-clamp(low,.5,600,8))));
    };
    for(const event of events) schedule(event);
    this.bed=bed;
  }
  setMuted(muted) {
    this.muted=muted;
    const ctx=this.context;
    if(ctx && this.bed) this.bed.master.gain.setTargetAtTime(muted?.0001:1,ctx.currentTime,.3);
  }
}
