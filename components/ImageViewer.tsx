import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LucideZoomIn, LucideZoomOut, LucideMinimize, LucideMove, LucideSplitSquareHorizontal, LucideX, LucideDownload } from 'lucide-react';

interface ImageViewerProps {
  originalSrc: string;
  translatedSrc: string;
  onReset: () => void;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ originalSrc, translatedSrc, onReset }) => {
  const [sliderPosition, setSliderPosition] = useState(50); // 0 to 100%
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Prevent default browser zoom behavior
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // --- Zoom Logic ---
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.001;
    const newZoom = Math.min(Math.max(zoom + scaleAmount * zoom, 0.5), 5);
    setZoom(newZoom);
  };

  const handleZoomIn = () => setZoom(z => Math.min(z * 1.2, 5));
  const handleZoomOut = () => setZoom(z => Math.max(z / 1.2, 0.5));
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // --- Panning Logic ---
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only start panning if we aren't clicking controls
    if (isDraggingSlider) return;
    
    if (e.button === 0) { // Left click
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsDraggingSlider(false);
  };

  // --- Slider Logic ---
  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingSlider(true);
  };

  // Global mouse move for slider (so you can drag outside the handle)
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (isDraggingSlider && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
        const percentage = (x / rect.width) * 100;
        setSliderPosition(percentage);
      }
    };

    const handleGlobalUp = () => {
      setIsDraggingSlider(false);
    };

    if (isDraggingSlider) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
    };
  }, [isDraggingSlider]);

  const handleDownload = () => {
      const link = document.createElement('a');
      link.href = translatedSrc;
      link.download = 'translated-document.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };


  return (
    <div className="relative w-full h-full bg-gray-950 flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-2xl">
        <div className="flex items-center gap-1 border-r border-gray-700 pr-4">
             <button onClick={handleZoomOut} className="p-2 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="Zoom Out">
              <LucideZoomOut size={18} />
            </button>
            <span className="text-xs font-mono w-12 text-center text-gray-400">{Math.round(zoom * 100)}%</span>
            <button onClick={handleZoomIn} className="p-2 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="Zoom In">
              <LucideZoomIn size={18} />
            </button>
        </div>
        
        <button onClick={handleFit} className="p-2 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="Reset View">
          <LucideMinimize size={18} />
        </button>

        <div className="border-l border-gray-700 pl-4">
            <button onClick={handleDownload} className="p-2 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="Download Translated">
                <LucideDownload size={18} />
            </button>
        </div>
      </div>

       <button 
          onClick={onReset}
          className="absolute top-4 right-4 z-30 p-2 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-full transition-colors"
          title="Close Image"
        >
          <LucideX size={20} />
      </button>

      {/* Labels Overlay (Static) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex items-center gap-24 opacity-60 font-mono text-xs tracking-widest uppercase text-white drop-shadow-md">
        <span>Translated</span>
        <span>Original</span>
      </div>


      {/* Viewport */}
      <div 
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing relative touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Transform Container */}
        <div 
          className="absolute origin-center will-change-transform"
          style={{
             transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
             transition: isDraggingSlider || isPanning ? 'none' : 'transform 0.1s ease-out',
             width: '100%',
             height: '100%',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center'
          }}
        >
          <div ref={viewportRef} className="relative shadow-2xl">
            
            {/* Layer 1: Translated Image (Bottom) */}
            {/* This image is fully drawn but hidden by Layer 2 where not clipped */}
            <img 
              src={translatedSrc} 
              alt="Translated" 
              className="max-w-[90vw] max-h-[80vh] object-contain select-none pointer-events-none"
              draggable={false}
            />

            {/* Layer 2: Original Image (Top) */}
            {/* We use clip-path to "wipe" it away from Left to Right. */}
            <div 
              className="absolute inset-0 w-full h-full select-none pointer-events-none"
              style={{
                // clip-path: inset(0 0 0 X%) means "Start clipping from the left by X%".
                // If slider is at 50%, we clip the left 50% of the Original, revealing Translated.
                clipPath: `inset(0 0 0 ${sliderPosition}%)`
              }}
            >
              <img 
                src={originalSrc} 
                alt="Original" 
                className="w-full h-full object-contain"
                draggable={false}
              />
            </div>

            {/* The Divider Line */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize z-20 group hover:bg-indigo-400 active:bg-indigo-500 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              style={{ left: `${sliderPosition}%` }}
              onMouseDown={handleSliderMouseDown}
            >
               {/* Handle Button */}
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform cursor-ew-resize text-gray-900">
                  <LucideSplitSquareHorizontal size={16} className="opacity-70" />
               </div>
            </div>

          </div>
        </div>
      </div>
      
      {/* Hint */}
      <div className="absolute bottom-4 right-4 z-20 text-xs text-gray-500 pointer-events-none select-none">
        Scroll to Zoom • Drag to Pan
      </div>
    </div>
  );
};