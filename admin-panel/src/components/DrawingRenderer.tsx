import React, { useRef, useEffect } from 'react';

interface Point {
  x: number;
  y: number;
}

interface DrawingStroke {
  color: string;
  width: number;
  points: Point[];
}

interface DrawingData {
  textElements: any[];
  drawingData: DrawingStroke[];
}

interface DrawingRendererProps {
  drawingData: DrawingData;
  width?: number;
  height?: number;
  className?: string;
}

const DrawingRenderer: React.FC<DrawingRendererProps> = ({ 
  drawingData, 
  width = 300, 
  height = 200, 
  className = "" 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Очищаем канвас
    ctx.clearRect(0, 0, width, height);

    // Устанавливаем белый фон
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Рисуем каждый штрих
    drawingData.drawingData.forEach(stroke => {
      if (stroke.points.length < 2) return;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Начинаем путь
      ctx.beginPath();
      
      // Перемещаемся к первой точке
      const firstPoint = stroke.points[0];
      ctx.moveTo(firstPoint.x, firstPoint.y);

      // Рисуем линии между точками
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        ctx.lineTo(point.x, point.y);
      }

      // Рисуем штрих
      ctx.stroke();
    });
  }, [drawingData, width, height]);

  if (!drawingData || !drawingData.drawingData || drawingData.drawingData.length === 0) {
    return (
      <div className={`bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-center text-gray-500">
          <div className="text-2xl mb-2">🎨</div>
          <div className="text-sm">Рисунок не найден</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-2 ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full h-auto"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
};

export default DrawingRenderer;
