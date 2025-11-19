import React, { useState, useCallback } from 'react';
import { Dropzone } from './components/Dropzone';
import { ImageViewer } from './components/ImageViewer';
import { analyzeImage } from './services/geminiService';
import { renderTranslatedImage, resizeImageForApi, generateMockTranslation } from './utils/imageProcessor';
import { LucideWand2, LucideImage, LucideLoader2 } from 'lucide-react';

enum AppState {
  UPLOAD,
  PROCESSING,
  VIEW
}

export default function App() {
  const [state, setState] = useState<AppState>(AppState.UPLOAD);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [translatedImage, setTranslatedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageSelect = useCallback(async (file: File) => {
    // Create object URL for the original high-res image for viewing
    const objectUrl = URL.createObjectURL(file);
    setOriginalImage(objectUrl);
    setState(AppState.PROCESSING);
    setError(null);

    try {
      // 1. Optimize Image for API (Resize & compress)
      const optimizedBase64 = await resizeImageForApi(file);

      // 2. Call Gemini API
      let regions;
      if (process.env.API_KEY) {
          regions = await analyzeImage(optimizedBase64);
      } else {
          console.warn("API Key missing, falling back to mock.");
          const mockUrl = await generateMockTranslation(objectUrl);
          setTranslatedImage(mockUrl);
          setState(AppState.VIEW);
          return;
      }

      // 3. Generate Image Overlay
      if (regions && regions.length > 0) {
        const translatedUrl = await renderTranslatedImage(objectUrl, regions);
        setTranslatedImage(translatedUrl);
        setState(AppState.VIEW);
      } else {
        console.log("No text detected");
        setTranslatedImage(objectUrl); 
        setState(AppState.VIEW);
      }

    } catch (error) {
      console.error("Failed to process image", error);
      setError("Translation failed. Please check your API key or internet connection.");
      setState(AppState.UPLOAD);
    }
  }, []);

  const handleReset = useCallback(() => {
    setOriginalImage(null);
    setTranslatedImage(null);
    setError(null);
    setState(AppState.UPLOAD);
  }, []);

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-gray-800 bg-gray-900 flex items-center px-6 justify-between z-10 shrink-0">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500 p-1.5 rounded-lg">
            <LucideWand2 className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">LensTranslate</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-8 px-3 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-medium text-gray-300">
             Gemini 3.0 Pro (Speed Optimized)
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {state === AppState.UPLOAD && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
            <div className="max-w-xl w-full">
              <div className="text-center mb-8">
                <h2 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                  Visual Translation Workspace
                </h2>
                <p className="text-gray-400">
                  Upload purchase orders, manuals, or forms. Layout preserved.
                </p>
              </div>
              
              {error && (
                <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-200 text-sm text-center">
                  {error}
                </div>
              )}

              <Dropzone onFileSelected={handleImageSelect} />
              
              <div className="mt-12 grid grid-cols-3 gap-4 opacity-50 hover:opacity-100 transition-opacity duration-300">
                <div className="h-32 bg-gray-800 rounded-lg border border-gray-700 flex flex-col items-center justify-center p-4 text-center">
                  <LucideImage className="w-8 h-8 mb-2 text-indigo-400" />
                  <span className="text-xs text-gray-300">Table Alignment</span>
                </div>
                <div className="h-32 bg-gray-800 rounded-lg border border-gray-700 flex flex-col items-center justify-center p-4 text-center">
                   <LucideWand2 className="w-8 h-8 mb-2 text-purple-400" />
                  <span className="text-xs text-gray-300">Smart Eraser</span>
                </div>
                <div className="h-32 bg-gray-800 rounded-lg border border-gray-700 flex flex-col items-center justify-center p-4 text-center">
                  <div className="flex gap-1 mb-2">
                     <div className="w-4 h-8 bg-gray-600 rounded-l-sm"></div>
                     <div className="w-4 h-8 bg-indigo-500 rounded-r-sm"></div>
                  </div>
                  <span className="text-xs text-gray-300">Comparison</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {state === AppState.PROCESSING && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-2xl opacity-20 rounded-full animate-pulse"></div>
              <LucideLoader2 className="w-16 h-16 text-indigo-500 animate-spin relative z-10" />
            </div>
            <h3 className="mt-8 text-xl font-medium">Analyzing Document...</h3>
            <p className="text-gray-500 mt-2 text-sm">Detecting table rows, aligning cells, and translating.</p>
          </div>
        )}

        {state === AppState.VIEW && originalImage && translatedImage && (
          <ImageViewer 
            originalSrc={originalImage} 
            translatedSrc={translatedImage} 
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}