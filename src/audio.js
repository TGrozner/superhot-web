/** Procedural feedback only. No copied or downloaded game audio. */
export function createAudio() {
  let ctx=null;
  const init=()=>{
    if (!ctx) ctx=new (window.AudioContext||window.webkitAudioContext)();
    if (ctx.state==='suspended') void ctx.resume();
  };
  function tone(frequency,duration,shape='triangle',volume=.08,slide=0) {
    if (!ctx) return;
    const t=ctx.currentTime;
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.type=shape;
    osc.frequency.setValueAtTime(frequency,t);
    if(slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30,frequency+slide),t+duration);
    gain.gain.setValueAtTime(volume,t);
    gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);osc.stop(t+duration+.005);
  }
  function noise(duration=.1,volume=.12) {
    if (!ctx) return;
    const size=Math.ceil(ctx.sampleRate*duration), buffer=ctx.createBuffer(1,size,ctx.sampleRate);
    const data=buffer.getChannelData(0);
    for(let i=0;i<size;i++) data[i]=(Math.random()*2-1)*(1-i/size);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
    filter.type='highpass';filter.frequency.value=600;
    gain.gain.value=volume;
    source.buffer=buffer; source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
  return {
    init,
    shoot(){noise(.11,.23);tone(92,.15,'sawtooth',.08,-40);},
    enemyShoot(){tone(180,.22,'sawtooth',.055,-120);},
    shatter(){noise(.30,.16);tone(680,.33,'triangle',.065,-590);},
    pickup(){tone(430,.07);setTimeout(()=>tone(770,.12,'triangle',.07),60);},
    hit(){tone(75,.35,'sawtooth',.19,-30);},
    empty(){tone(650,.04,'square',.04);},
    win(){tone(420,.15);setTimeout(()=>tone(670,.24),130);},
  };
}
