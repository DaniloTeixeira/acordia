// Metrônomo: agenda os cliques no relógio do áudio (precisão de amostra) com uma janela de
// antecedência curta, e avisa a interface de cada tempo para acender o indicador.
import type { ClickKind } from "./audio";

export const SIGNATURES: Record<string, {beats: number; mid?: number[]}> = {"2/4":{beats:2}, "3/4":{beats:3}, "4/4":{beats:4}, "6/8":{beats:6, mid:[3]}};
const TEMPOS: [number, string][] = [[45,"Grave"],[60,"Largo"],[66,"Larghetto"],[76,"Adagio"],[108,"Andante"],[120,"Moderato"],[156,"Allegro"],[176,"Vivace"],[200,"Presto"],[Infinity,"Prestissimo"]];
export const MIN_BPM = 30, MAX_BPM = 240;
export const clampBpm = (v: number | string) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(+v) || 80));
export function tempoName(bpm: number){ return TEMPOS.find(([max]) => bpm < max)![1]; }
// BPM pelos últimos toques (em ms). Recomeça se o intervalo mudar muito ou passar de 2 s.
export function tapTempo(times: number[]){
  const recent: number[] = []; for(let i = times.length - 1; i > 0 && recent.length < 6; i--){
    const d = times[i] - times[i-1]; if(d > 2000) break;
    if(recent.length && Math.abs(d - recent[0]) > recent[0] * 0.4) break;
    recent.push(d);
  }
  if(!recent.length) return null;
  return clampBpm(60000 / (recent.reduce((a, b) => a + b, 0) / recent.length));
}

export interface MetroState { bpm: number; sig: string; subdiv: number; accent: boolean }
export interface AudioClock { audioNow(): number; audioReady(): Promise<boolean>; click(kind: ClickKind, at?: number): boolean }
export type Metronome = ReturnType<typeof createMetronome>;

export function createMetronome(audio: AudioClock, initial: Partial<MetroState> = {}){
  const st: MetroState = Object.assign({bpm:80, sig:"4/4", subdiv:1, accent:true}, initial);
  const listeners = new Set<(beat: number, sub: number) => void>(), changes = new Set<(s: MetroState, running: boolean) => void>();
  let timer: ReturnType<typeof setInterval> | null = null, next = 0, beat = 0, sub = 0;
  function schedule(){
    const now = audio.audioNow(), sig = SIGNATURES[st.sig] || SIGNATURES["4/4"];
    while(next < now + 0.12){
      const kind: ClickKind = sub ? "sub" : beat === 0 ? (st.accent ? "accent" : "beat") : (sig.mid || []).includes(beat) && st.accent ? "mid" : "beat";
      audio.click(kind, next);
      const b = beat, s = sub, delay = Math.max(0, (next - now) * 1000);
      setTimeout(() => listeners.forEach(f => f(b, s)), delay);
      if(++sub >= st.subdiv){ sub = 0; beat = (beat + 1) % sig.beats; }
      next += 60 / st.bpm / st.subdiv;
    }
  }
  const emit = () => changes.forEach(f => f(Object.assign({}, st), !!timer));
  const api = {
    get state(): MetroState { return Object.assign({}, st); },
    get running(){ return !!timer; },
    async start(){
      if(timer) return true;
      if(!(await audio.audioReady())) return false;
      beat = 0; sub = 0; next = audio.audioNow() + 0.06;
      timer = setInterval(schedule, 25); schedule(); emit();
      return true;
    },
    stop(){ if(!timer) return; clearInterval(timer); timer = null; emit(); },
    async toggle(){ if(timer){ api.stop(); return true; } return api.start(); },
    set(opts: Partial<MetroState>){
      if(opts.bpm !== undefined) opts.bpm = clampBpm(opts.bpm);
      if(opts.sig && opts.sig !== st.sig){ beat = 0; sub = 0; }
      Object.assign(st, opts); emit();
    },
    // Onde cai o próximo tempo (relógio do áudio) e qual é ele no compasso, para outros sons entrarem alinhados.
    grid(): {nextBeatAt: number; beat: number} | null {
      if(!timer) return null;
      const sig = SIGNATURES[st.sig] || SIGNATURES["4/4"];
      return sub ? {nextBeatAt: next + (st.subdiv - sub) * 60 / st.bpm / st.subdiv, beat: (beat + 1) % sig.beats} : {nextBeatAt: next, beat};
    },
    onTick(fn: (beat: number, sub: number) => void){ listeners.add(fn); return () => { listeners.delete(fn); }; },
    onChange(fn: (s: MetroState, running: boolean) => void){ changes.add(fn); return () => { changes.delete(fn); }; }
  };
  return api;
}
