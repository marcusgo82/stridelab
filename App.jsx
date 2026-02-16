import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Activity, 
  ChevronRight, 
  CheckCircle, 
  AlertTriangle, 
  Footprints, 
  RotateCcw,
  Zap,
  Shield,
  Feather,
  ScanLine,
  Eye, 
  EyeOff,
  Move,
  Loader2,
  Maximize2,
  Search,
  Download,
  Sparkles,
  Dna,
  ShoppingBag,
  Dumbbell,
  Sliders,
  Layers,
  ImageIcon,
  Cpu,
  Ruler,
  ExternalLink
} from 'lucide-react';

/**
 * STRIDELAB.AI - BIOMECHANISCHE LAUFSCHUH-ANALYSE
 * * Diese Anwendung analysiert Fußabdrücke basierend auf dem Chippaux-Smirak-Index (CSI) 
 * und dem Staheli-Index (SI). Sie nutzt Gemini AI für personalisierte Empfehlungen.
 */

// --- Biomechanische Typen ---
const FOOT_TYPES = {
  flat: {
    id: 'flat',
    name: 'Pes Planus (Senk-/Plattfuß)',
    pronation: 'Überpronation',
    description: 'Große Kontaktfläche im Mittelfuß. Ein hoher Staheli-Index deutet auf ein abgesunkenes Längsgewölbe hin.',
    medicalRisks: ['Schienbeinkantensyndrom', 'Plantarfasziitis', 'Innenmeniskus-Belastung'],
    shoeType: 'Stabilitätsschuh / Motion Control',
    icon: Shield,
    color: 'text-red-400',
    overlayColor: 'rgba(248, 113, 113, 0.4)' 
  },
  neutral: {
    id: 'neutral',
    name: 'Pes Rectus (Normalfuß)',
    pronation: 'Neutrale Pronation',
    description: 'Physiologisch gesundes Verhältnis der Druckpunkte. Der Fuß rollt effizient über den Großzehenballen ab.',
    medicalRisks: ['Geringes Verletzungsrisiko bei Standardbelastung'],
    shoeType: 'Neutralschuh',
    icon: Zap,
    color: 'text-green-400',
    overlayColor: 'rgba(74, 222, 128, 0.4)' 
  },
  high: {
    id: 'high',
    name: 'Pes Cavus (Hohlfuß)',
    pronation: 'Supination (Unterpronation)',
    description: 'Minimale Kontaktfläche im Mittelfuß. Die Stoßdämpfung durch das Gewölbe ist biomechanisch eingeschränkt.',
    medicalRisks: ['Stressfrakturen', 'Instabilität im Sprunggelenk', 'Sehnenreizungen'],
    shoeType: 'Dämpfungsschuh (Neutral Plus)',
    icon: Feather,
    color: 'text-blue-400',
    overlayColor: 'rgba(96, 165, 250, 0.4)'
  }
};

// --- Point Cloud Engine (Lidar-Visualisierung) ---
const FootprintMesh = ({ imageSrc, width, height, sensitivity, contrast }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!width || !height || width <= 0 || height <= 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageSrc;

    let isMounted = true;
    img.onload = () => {
      if (!isMounted) return;
      ctx.clearRect(0, 0, width, height);
      const offCanvas = document.createElement('canvas');
      const scaleFactor = 0.25; 
      const smallW = Math.max(1, Math.floor(width * scaleFactor));
      const smallH = Math.max(1, Math.floor(height * scaleFactor));
      offCanvas.width = smallW;
      offCanvas.height = smallH;
      const offCtx = offCanvas.getContext('2d');
      offCtx.filter = `contrast(${contrast}%) grayscale(100%) brightness(1.1)`;
      offCtx.drawImage(img, 0, 0, smallW, smallH);
      const imageData = offCtx.getImageData(0, 0, smallW, smallH);
      const data = imageData.data;
      const gap = 3; 
      const threshold = 40 + (sensitivity * 2.0); 

      for (let y = 0; y < smallH; y += gap) {
        for (let x = 0; x < smallW; x += gap) {
          const index = (y * smallW + x) * 4;
          if (data[index] < threshold) {
            const originalX = x / scaleFactor;
            const originalY = y / scaleFactor;
            const intensity = 1 - (data[index] / threshold); 
            ctx.beginPath();
            let color = intensity > 0.6 ? 'rgba(239, 68, 68, 0.9)' : (intensity > 0.3 ? 'rgba(234, 179, 8, 0.7)' : 'rgba(34, 211, 238, 0.7)');
            ctx.arc(originalX, originalY, (1 + (intensity * 2.5)) * scaleFactor * 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
        }
      }
    };
    return () => { isMounted = false; };
  }, [imageSrc, width, height, sensitivity, contrast]);

  return <canvas ref={canvasRef} width={width} height={height} className="absolute inset-0 pointer-events-none z-20 mix-blend-screen" />;
};

// --- Hauptkomponente ---
export default function App() {
  const [step, setStep] = useState(1);
  const [image, setImage] = useState(null);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 }); 
  const [shoeSize, setShoeSize] = useState(42); 
  const [result, setResult] = useState(null);
  const [highContrastMode, setHighContrastMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [displayMode, setDisplayMode] = useState('both');
  const [meshSensitivity, setMeshSensitivity] = useState(65); 
  const [imageContrast, setImageContrast] = useState(130); 
  const [aiLoading, setAiLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [selectedShoe, setSelectedShoe] = useState(null); 
  const [tools, setTools] = useState({
    forefoot: { y: 25, x: 20, width: 60 },
    arch: { y: 50, x: 35, width: 30 },
    heel: { y: 80, x: 30, width: 40 }
  });

  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [dragState, setDragState] = useState(null); 

  useEffect(() => {
    const updateSize = () => { if (containerRef.current) setContainerSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight }); };
    window.addEventListener('resize', updateSize);
    const observer = new ResizeObserver(updateSize);
    if (containerRef.current) observer.observe(containerRef.current);
    updateSize();
    return () => { window.removeEventListener('resize', updateSize); observer.disconnect(); };
  }, [step]); 

  const getFittedDims = () => {
    if (!containerSize.w || !imgNaturalSize.w) return { w: 0, h: 0 };
    const cR = containerSize.w / containerSize.h;
    const iR = imgNaturalSize.w / imgNaturalSize.h;
    return iR > cR ? { w: containerSize.w, h: containerSize.w / iR } : { h: containerSize.h, w: containerSize.h * iR };
  };
  const fittedDims = getFittedDims();

  const getShoeName = (shoe) => shoe ? (typeof shoe === 'string' ? shoe : (shoe.name || shoe.model || 'Laufschuh')) : '';

  const fetchGeminiAnalysis = async (diagnosis, csi, si) => {
    setAiLoading(true);
    const apiKey = ""; // HIER API KEY EINTRAGEN (Lokal: import.meta.env.VITE_GEMINI_KEY)
    const systemPrompt = "Sportorthopäde. JSON Output.";
    const userPrompt = `Analyse: ${diagnosis.name}, Gr: ${shoeSize}, CSI: ${csi}, SI: ${si}. JSON: {explanation: str, shoes: [str,str,str], exercise: {name: str, instruction: str}}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { responseMimeType: "application/json" } })
      });
      const data = await response.json();
      const content = JSON.parse(data.candidates[0].content.parts[0].text);
      setAiData(content);
      if (content.shoes?.length > 0) setSelectedShoe(content.shoes[0]);
    } catch (e) { console.error(e); } finally { setAiLoading(false); }
  };

  const handlePointerDown = (e, toolName, action) => {
    if (isScanning) return;
    setDragState({ toolName, action, startX: e.clientX, startY: e.clientY, initialToolState: { ...tools[toolName] } });
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragState || !fittedDims.w) return;
      const deltaXPct = ((e.clientX - dragState.startX) / fittedDims.w) * 100;
      const deltaYPct = ((e.clientY - dragState.startY) / fittedDims.h) * 100;
      let next = { ...tools[dragState.toolName] };
      if (dragState.action === 'move') {
        next.x = Math.min(Math.max(dragState.initialToolState.x + deltaXPct, 0), 100 - next.width);
        next.y = Math.min(Math.max(dragState.initialToolState.y + deltaYPct, 0), 100);
      } else if (dragState.action === 'resize-right') {
        next.width = Math.min(Math.max(dragState.initialToolState.width + deltaXPct, 5), 100 - next.x);
      } else if (dragState.action === 'resize-left') {
        const potentialX = dragState.initialToolState.x + deltaXPct;
        const potentialW = dragState.initialToolState.width - deltaXPct;
        if (potentialW >= 5 && potentialX >= 0) { next.x = potentialX; next.width = potentialW; }
      }
      setTools(prev => ({ ...prev, [dragState.toolName]: next }));
    };
    const handleUp = () => setDragState(null);
    if (dragState) { window.addEventListener('pointermove', handleMove); window.addEventListener('pointerup', handleUp); }
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp); };
  }, [dragState, tools, fittedDims]);

  const processFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => { setImgNaturalSize({ w: img.width, h: img.height }); setImage(e.target.result); setStep(2); setHighContrastMode(true); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  const startAnalysis = () => {
    setIsScanning(true); setScanProgress(0);
    const interval = setInterval(() => setScanProgress(p => p >= 100 ? (clearInterval(interval), 100) : p + 2), 25);
    setTimeout(() => {
      const csi = tools.arch.width / tools.forefoot.width;
      const si = tools.arch.width / tools.heel.width;
      const typeKey = (csi >= 0.55 || si >= 0.75) ? 'flat' : ((csi <= 0.25 || si <= 0.4) ? 'high' : 'neutral');
      const diag = FOOT_TYPES[typeKey];
      setResult({ ...diag, metrics: { csi: csi.toFixed(2), si: si.toFixed(2) } });
      setStep(3); setHighContrastMode(false); setIsScanning(false);
      fetchGeminiAnalysis(diag, csi.toFixed(2), si.toFixed(2));
    }, 1800);
  };

  const MeasurementTool = ({ toolKey, colorClass, borderClass, bgClass, label, readOnly = false }) => {
    const tool = tools[toolKey];
    return (
      <div className="absolute h-10 flex items-center touch-none transition-all duration-75" style={{ top: `${tool.y}%`, left: `${tool.x}%`, width: `${tool.width}%`, transform: 'translateY(-50%)', zIndex: 30 }}>
        <div className={`relative w-full h-full border-2 ${borderClass} ${bgClass} backdrop-blur-[1px] flex items-center justify-between shadow-lg`}>
          {!readOnly && <div className="w-8 h-full cursor-ew-resize hover:bg-white/20 z-20 flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, toolKey, 'resize-left')}><div className={`w-1 h-4 rounded-full ${colorClass.replace('text-', 'bg-')}`}></div></div>}
          <div className={`flex-1 h-full flex items-center justify-center ${!readOnly ? 'cursor-move hover:bg-white/10' : ''}`} onPointerDown={(e) => !readOnly && handlePointerDown(e, toolKey, 'move')}><div className={`px-3 py-1 rounded-md bg-slate-950/90 border ${borderClass} text-[10px] font-mono ${colorClass} font-bold tracking-wider flex items-center gap-2 select-none shadow-xl`}>{!readOnly && <Move className="w-3.5 h-3.5" />} {label}</div></div>
          {!readOnly && <div className="w-8 h-full cursor-ew-resize hover:bg-white/20 z-20 flex items-center justify-center" onPointerDown={(e) => handlePointerDown(e, toolKey, 'resize-right')}><div className={`w-1 h-4 rounded-full ${colorClass.replace('text-', 'bg-')}`}></div></div>}
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 font-sans flex flex-col overflow-hidden">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 flex-none px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3"><div className="p-2 bg-cyan-500/10 rounded-lg"><Footprints className="text-cyan-400 w-6 h-6" /></div><span className="text-xl font-bold">StrideLab.ai</span></div>
        {step > 1 && !isScanning && <button onClick={() => setStep(1)} className="bg-slate-900 px-4 py-2 rounded-lg text-xs font-bold text-slate-400 border border-slate-800 flex items-center gap-2"><RotateCcw className="w-4 h-4" /> RESET</button>}
      </header>
      <main className="flex-1 w-full max-w-[98%] mx-auto px-6 py-4 overflow-hidden flex flex-col">
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center animate-fadeIn space-y-8">
            <div className="text-center max-w-2xl"><h1 className="text-5xl font-extrabold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Abdruckanalyse</h1></div>
            <div className="w-full max-w-2xl aspect-video border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/40 hover:border-cyan-500/50 flex flex-col items-center justify-center cursor-pointer group relative overflow-hidden transition-all" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault(); processFile(e.dataTransfer.files[0])}}>
              <input type="file" className="absolute inset-0 opacity-0" onChange={e=>processFile(e.target.files[0])} accept="image/*" />
              <div className="flex flex-col items-center gap-6 group-hover:scale-110 transition-transform"><div className="p-6 bg-slate-800 rounded-full text-cyan-400 border border-slate-700"><Upload className="w-10 h-10" /></div><p className="font-bold text-xl">Fußabdruck hochladen</p></div>
            </div>
          </div>
        )}
        {step >= 2 && (
          <div className="animate-fadeIn w-full h-full grid grid-cols-1 lg:grid-cols-12 gap-8 overflow-hidden">
            <div className={`lg:col-span-${step===2?'8':'6'} flex flex-col h-full min-h-0`}>
              {step === 2 && (
                <div className="flex-none grid grid-cols-1 md:grid-cols-12 gap-4 mb-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800 items-center">
                   <div className="md:col-span-6 flex items-center gap-8">
                     <div className="flex-1 flex flex-col gap-1"><div className="flex justify-between text-[10px] uppercase text-slate-400 font-black"><span>Sensitivität</span><span className="text-cyan-400">{meshSensitivity}%</span></div><input type="range" min="0" max="100" value={meshSensitivity} onChange={e=>setMeshSensitivity(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500" /></div>
                     <div className="flex-1 flex flex-col gap-1"><div className="flex justify-between text-[10px] uppercase text-slate-400 font-black"><span>Kontrast</span><span className="text-white">{imageContrast}%</span></div><input type="range" min="50" max="250" value={imageContrast} onChange={e=>setImageContrast(parseInt(e.target.value))} className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-white" /></div>
                   </div>
                   <div className="md:col-span-6 flex items-center justify-end border-l border-slate-800 pl-6 gap-2">
                        <button onClick={()=>setHighContrastMode(!highContrastMode)} className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-[10px] uppercase font-black transition-all ${highContrastMode?'bg-cyan-500 text-slate-950':'text-slate-500'}`}>{highContrastMode?<Eye className="w-3.5 h-3.5"/>:<EyeOff className="w-3.5 h-3.5"/>} High-Res</button>
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">{[{id:'both',icon:Layers},{id:'image',icon:ImageIcon},{id:'mesh',icon:Cpu}].map(m=>(<button key={m.id} onClick={()=>setDisplayMode(m.id)} className={`p-2 rounded-lg transition-all ${displayMode===m.id?'bg-cyan-500 text-slate-950':'text-slate-500'}`}><m.icon className="w-3.5 h-3.5" /></button>))}</div>
                   </div>
                </div>
              )}
              <div className="flex-1 relative bg-black rounded-[2rem] overflow-hidden border border-slate-800 flex items-center justify-center min-h-0" ref={containerRef}>
                <div className="relative transition-all duration-500" style={{ width: fittedDims.w, height: fittedDims.h }}>
                    <img src={image} alt="Footprint" className={`w-full h-full transition-opacity duration-500 ${displayMode==='mesh'?'opacity-0':'opacity-100'}`} style={{ filter: highContrastMode ? `grayscale(100%) contrast(${imageContrast+30}%) brightness(1.1)` : `grayscale(100%) contrast(${imageContrast}%) brightness(1.05)` }} />
                    {fittedDims.w > 0 && displayMode !== 'image' && <FootprintMesh imageSrc={image} width={fittedDims.w} height={fittedDims.h} isActive={true} sensitivity={meshSensitivity} contrast={imageContrast} />}
                    {!isScanning && <>{['forefoot','arch','heel'].map(k=>(<MeasurementTool key={k} toolKey={k} colorClass={k==='forefoot'?'text-cyan-400':(k==='arch'?'text-amber-400':'text-purple-400')} borderClass={k==='forefoot'?'border-cyan-400':(k==='arch'?'border-amber-400':'border-purple-400')} bgClass={k==='forefoot'?'bg-cyan-500/10':(k==='arch'?'bg-amber-500/10':'bg-purple-500/10')} label={k.toUpperCase()} readOnly={step===3} />))}</>}
                    {isScanning && <div className="absolute inset-0 z-50 pointer-events-none"><div className="absolute left-0 w-full h-[2px] bg-green-400 shadow-[0_0_30px_rgba(74,222,128,1)]" style={{ top: `${scanProgress}%` }}></div><div className="absolute left-0 w-full h-64 bg-gradient-to-t from-green-400/20 to-transparent" style={{ top: `${scanProgress}%`, transform: 'translateY(-100%)' }}></div></div>}
                </div>
                {isScanning && <div className="absolute top-10 right-10 font-mono text-green-400 text-3xl font-black drop-shadow-lg z-50">{scanProgress}%</div>}
              </div>
            </div>
            <div className={`lg:col-span-${step===2?'4':'6'} flex flex-col h-full min-h-0`}>
              {step === 2 && (
                <div className="space-y-6 flex flex-col h-full">
                  <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-800 flex-1 overflow-y-auto"><h3 className="text-white font-bold text-xl flex items-center gap-3 uppercase mb-6"><Maximize2 className="w-5 h-5 text-cyan-400" /> Kalibrierung</h3><div className="mb-8 bg-slate-950/50 p-4 rounded-2xl border border-slate-800 flex items-center justify-between"><div className="flex items-center gap-3"><Ruler className="w-5 h-5 text-cyan-400" /><span className="text-white text-sm font-bold">Größe (EU)</span></div><input type="number" min="30" max="52" value={shoeSize} onChange={e=>setShoeSize(parseInt(e.target.value))} className="bg-slate-900 px-4 py-2 rounded-xl text-white font-black w-14 text-center" /></div><div className="space-y-8">{['Vorfuß','Gewölbe','Ferse'].map((l,i)=>(<div key={i} className={`text-sm text-slate-300 border-l-2 ${i===0?'border-cyan-500':i===1?'border-amber-500':'border-purple-500'} pl-6`}><strong className={`block uppercase text-[11px] mb-2 ${i===0?'text-cyan-400':i===1?'text-amber-400':'text-purple-400'}`}>{i+1}. {l}</strong>Positionieren Sie den Kasten auf der breitesten Stelle des {l}s.</div>))}</div></div>
                  <button onClick={startAnalysis} disabled={isScanning} className="py-6 bg-white text-slate-950 font-black rounded-2xl shadow-2xl flex items-center justify-center gap-4 uppercase">{isScanning?<Loader2 className="animate-spin"/>:<Activity/>} Analyse Starten</button>
                </div>
              )}
              {step === 3 && result && (
                <div className="animate-slideLeft space-y-6 flex flex-col h-full overflow-hidden">
                   <div className="bg-slate-900/80 p-8 rounded-3xl border border-slate-800 flex-none"><div className="flex items-center justify-between mb-4"><div className="text-[11px] font-black uppercase text-slate-500 flex items-center gap-2"><Activity className={result.color}/> Report</div><div className="bg-slate-950 px-3 py-1.5 rounded-lg border text-slate-400 font-bold text-[10px]">EU {shoeSize}</div></div><h3 className="text-4xl font-black text-white mb-2">{result.name}</h3><p className="text-slate-400">{result.description}</p></div>
                   <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                      {aiLoading && <div className="bg-cyan-500/10 p-6 rounded-3xl border border-cyan-500/20 flex items-center gap-4 text-cyan-400 animate-pulse"><Sparkles/><span>KI-Experte berechnet Modelle...</span></div>}
                      {aiData && (
                         <div className="bg-slate-900/60 p-6 rounded-3xl border border-cyan-500/30 relative overflow-hidden"><div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500"></div><div className="flex items-center gap-3 mb-4"><Sparkles className="text-cyan-400"/><h4 className="font-black text-white text-sm uppercase">KI Insights</h4></div><div className="text-slate-300 space-y-4"><p className="leading-relaxed">{aiData.explanation}</p>{aiData.exercise && <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 flex gap-4"><Dumbbell className="text-cyan-400 mt-1 shrink-0"/><div className="text-xs"><strong className="text-cyan-400 uppercase block mb-1">Übung</strong><span className="block font-bold text-white mb-1">{aiData.exercise.name}</span><p>{aiData.exercise.instruction}</p></div></div>}</div></div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {['csi','si'].map(k=>(<div key={k} className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-inner"><div className="text-[10px] font-black text-slate-500 uppercase">{k.toUpperCase()} Index</div><div className="text-3xl font-black text-white font-mono">{result.metrics[k]}</div></div>))}
                      </div>
                      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl border border-slate-700 border-l-8 border-l-cyan-500 shadow-2xl"><div className="flex justify-between items-start mb-6"><div><span className="text-[10px] font-black text-cyan-500 uppercase">Empfehlung</span><h4 className="text-3xl font-black text-white">{result.shoeType}</h4></div><div className="p-3 bg-cyan-500/10 rounded-2xl"><result.icon className="text-cyan-400 w-8 h-8"/></div></div>{aiData?.shoes && <div className="space-y-4"><p className="text-[10px] text-slate-500 uppercase font-black">Top Modelle (Klick zum Auswählen)</p><div className="flex flex-wrap gap-3">{aiData.shoes.map((s,i)=>(<button key={i} onClick={()=>setSelectedShoe(s)} className={`px-5 py-2.5 rounded-xl text-xs font-bold border transition-all ${getShoeName(selectedShoe)===getShoeName(s)?'bg-cyan-500 text-slate-950 border-cyan-400':'bg-slate-950 text-slate-400 border-slate-700'}`}>{s}</button>))}</div></div>}<button onClick={()=>window.open(`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(getShoeName(selectedShoe)+' EU '+shoeSize+' Laufschuh')}`,'_blank')} disabled={!selectedShoe} className={`w-full mt-8 py-5 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-3 transition-all ${selectedShoe?'bg-white text-slate-950 hover:bg-cyan-50 shadow-2xl':'bg-slate-800 text-slate-600'}`}>{selectedShoe?`Preise für ${getShoeName(selectedShoe).split(' ')[0]} prüfen`:'Modell wählen'}<ExternalLink className="w-5 h-5" /></button></div>
                   </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
