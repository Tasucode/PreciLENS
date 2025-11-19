import React, { useCallback, useState } from 'react';
import { LucideUploadCloud, LucideFileImage } from 'lucide-react';

interface DropzoneProps {
  onFileSelected: (file: File) => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFileSelected }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
    }
  }, [onFileSelected]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
    }
  }, [onFileSelected]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative group cursor-pointer
        border-2 border-dashed rounded-2xl p-10 transition-all duration-300
        flex flex-col items-center justify-center
        min-h-[300px] bg-gray-900/50
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-500/10 scale-[1.02]' 
          : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'}
      `}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleInputChange}
        accept="image/*"
      />
      
      <div className={`
        p-5 rounded-full bg-gray-800 mb-6 shadow-xl
        transition-transform duration-300 group-hover:scale-110 group-hover:bg-gray-700
        ${isDragging ? 'bg-indigo-500/20' : ''}
      `}>
        {isDragging ? (
          <LucideFileImage className="w-10 h-10 text-indigo-400" />
        ) : (
          <LucideUploadCloud className="w-10 h-10 text-gray-400 group-hover:text-white" />
        )}
      </div>

      <h3 className="text-xl font-semibold mb-2 text-gray-200">
        {isDragging ? 'Drop image here' : 'Drag & Drop an image'}
      </h3>
      
      <p className="text-sm text-gray-500 max-w-xs text-center">
        Supports JPG, PNG, WebP. We'll detect the layout automatically.
      </p>
    </div>
  );
};