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

    // Очищаем фон
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Проверяем наличие данных
    const hasStrokes = drawingData.drawingData && drawingData.drawingData.length > 0;
    const hasTexts = drawingData.textElements && drawingData.textElements.length > 0;

    // Если нет ни штрихов, ни текста — показываем заглушку
    if (!hasStrokes && !hasTexts) {
      ctx.fillStyle = '#9ca3af';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px Arial';
      ctx.fillText('Рисунок не найден', width / 2, height / 2);
      return;
    }

    // Собираем все точки для вычисления границ
    const allPoints: Point[] = [];
    if (hasStrokes) {
      (drawingData.drawingData || []).forEach(stroke => {
        (stroke.points || []).forEach(p => allPoints.push(p));
      });
    }

    // Добавляем позиции текстов к границам
    if (hasTexts) {
      (drawingData.textElements || []).forEach(el => {
        const fontSize: number = el.font ? parseInt(el.font.match(/\d+/)?.[0] || '16') : 16;
        const text: string = el.text || '';
        const approxWidth = Math.max(1, Math.floor(0.8 * fontSize * text.length));
        allPoints.push({ x: el.x || 0, y: el.y || 0 });
        allPoints.push({ x: (el.x || 0) + approxWidth, y: (el.y || 0) + fontSize });
      });
    }

    // Вычисляем границы
    let minX = 0, minY = 0, maxX = width, maxY = height;
    
    if (allPoints.length > 0) {
      minX = Math.min(...allPoints.map(p => p.x));
      minY = Math.min(...allPoints.map(p => p.y));
      maxX = Math.max(...allPoints.map(p => p.x));
      maxY = Math.max(...allPoints.map(p => p.y));
    }

    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);

    // Вычисляем масштаб с учетом отступов
    const padding = 20;
    const scaleX = (width - 2 * padding) / contentW;
    const scaleY = (height - 2 * padding) / contentH;
    const scale = Math.min(scaleX, scaleY);

    // Смещение для центрирования
    const offsetX = (width - contentW * scale) / 2 - minX * scale;
    const offsetY = (height - contentH * scale) / 2 - minY * scale;

    // Рисуем штрихи с трансформацией
    if (hasStrokes) {
      (drawingData.drawingData || []).forEach(stroke => {
        if (!stroke.points || stroke.points.length < 2) return;
        ctx.strokeStyle = stroke.color || '#000000';
        ctx.lineWidth = Math.max(1, (stroke.width || 2) * scale);
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

    // Рисуем текстовые элементы с трансформацией (избегаем наложения)
    if (hasTexts) {
      const placedRects: Array<{x:number;y:number;w:number;h:number}> = [];
      (drawingData.textElements || []).forEach((el) => {
        // Парсим размер и шрифт типа "16px Arial"
        const rawFont = typeof el.font === 'string' ? el.font : '16px Arial';
        const sizeMatch = rawFont.match(/(\d+)px/);
        const familyMatch = rawFont.replace(/\d+px\s*/, '').trim();
        const fontSize: number = sizeMatch ? parseInt(sizeMatch[1], 10) : 16;
        const fontFamily: string = familyMatch || 'Arial';

        // Масштабируем размер шрифта пропорционально, но не ниже порога читаемости
        const scaledFont = Math.max(12, Math.min(28, Math.floor(fontSize * scale)));
        ctx.font = `${scaledFont}px ${fontFamily}`;
        ctx.fillStyle = el.color || '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const x = (el.x || 0) * scale + offsetX;
        let y = (el.y || 0) * scale + offsetY;

        // Рассчитываем ширину текста
        const text = el.text || '';
        const textWidth = ctx.measureText(text).width;

        // Избегаем пересечения с ранее размещенными текстами
        const h = scaledFont; // высота строки ~ размеру шрифта
        const intersects = (r1: {x:number;y:number;w:number;h:number}, r2: {x:number;y:number;w:number;h:number}) => (
          r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y
        );
        let candidate = { x, y, w: textWidth, h };
        let safety = 0;
        while (placedRects.some(r => intersects(candidate, r)) && safety < 50) {
          // Сдвигаем вниз на 10% высоты шрифта до устранения пересечения
          y += Math.max(1, Math.floor(h * 0.1));
          candidate = { x, y, w: textWidth, h };
          safety++;
        }
        placedRects.push(candidate);

        // Рисуем как есть, без автопереносов, чтобы сохранить исходную раскладку
        ctx.fillText(text, x, y);
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
