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

    // Собираем все точки штрихов
    const allPoints: Point[] = [];
    (drawingData.drawingData || []).forEach(stroke => {
      (stroke.points || []).forEach(p => allPoints.push(p));
    });

    // Собираем прямоугольники текстов (используем приблизительную ширину = 0.6 * fontSize * text.length)
    type TextBBox = { x: number; y: number; w: number; h: number };
    const textBBoxes: TextBBox[] = [];
    (drawingData.textElements || []).forEach(el => {
      const fontSize: number = el.font ? parseInt(el.font.match(/\d+/)?.[0] || '16') : 16;
      const text: string = el.text || '';
      const approxWidth = Math.max(1, Math.floor(0.6 * fontSize * text.length));
      const approxHeight = fontSize;
      textBBoxes.push({ x: el.x || 0, y: el.y || 0, w: approxWidth, h: approxHeight });
    });

    const hasStrokes = allPoints.length > 0;
    const hasTexts = textBBoxes.length > 0;

    // Если нет ни штрихов, ни текста — показываем заглушку
    if (!hasStrokes && !hasTexts) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#9ca3af';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px Arial';
      ctx.fillText('Рисунок не найден', width / 2, height / 2);
      return;
    }

    // Считаем bbox контента
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (hasStrokes) {
      allPoints.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    }

    if (hasTexts) {
      textBBoxes.forEach(b => {
        if (b.x < minX) minX = b.x;
        if (b.y < minY) minY = b.y;
        if (b.x + b.w > maxX) maxX = b.x + b.w;
        if (b.y + b.h > maxY) maxY = b.y + b.h;
      });
    }

    // Если bbox невалиден, принудительно задаём минимальные границы
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      minX = 0; minY = 0; maxX = width; maxY = height;
    }

    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);

    // Добавляем поля по краям (5%)
    const padding = 0.05;
    const targetW = width * (1 - 2 * padding);
    const targetH = height * (1 - 2 * padding);

    const scaleX = targetW / contentW;
    const scaleY = targetH / contentH;
    const scale = Math.min(scaleX, scaleY);

    // Смещение для центрирования
    const offsetX = (width - contentW * scale) / 2 - minX * scale;
    const offsetY = (height - contentH * scale) / 2 - minY * scale;

    // Очищаем фон
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Рисуем штрихи с трансформацией
    if (hasStrokes) {
      (drawingData.drawingData || []).forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.width * scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        const p0 = stroke.points[0];
        ctx.moveTo(p0.x * scale + offsetX, p0.y * scale + offsetY);
        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x * scale + offsetX, p.y * scale + offsetY);
        }
        ctx.stroke();
      });
    }

    // Рисуем текстовые элементы с трансформацией
    if (hasTexts) {
      (drawingData.textElements || []).forEach(el => {
        const fontSize: number = el.font ? parseInt(el.font.match(/\d+/)?.[0] || '16') : 16;
        const fontFamily: string = el.font ? (el.font.match(/[a-zA-Z\s]+/)?.[0]?.trim() || 'Arial') : 'Arial';
        const scaledFont = Math.max(10, Math.floor(fontSize * scale));

        ctx.font = `${scaledFont}px ${fontFamily}`;
        ctx.fillStyle = el.color || '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const x = (el.x || 0) * scale + offsetX;
        const y = (el.y || 0) * scale + offsetY;
        ctx.fillText(el.text || '', x, y);
      });
    }
  }, [drawingData, width, height]);

  // Проверяем, есть ли данные для отображения
  const hasDrawingData = drawingData?.drawingData && drawingData.drawingData.length > 0;
  const hasTextElements = drawingData?.textElements && drawingData.textElements.length > 0;
  
  if (!drawingData || (!hasDrawingData && !hasTextElements)) {
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
