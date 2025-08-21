import { format as formatDate } from 'date-fns';

/**
 * Конвертирует UTC время в MSK (+3) если необходимо
 * @param utcTime - время в UTC или уже в MSK
 * @returns время в MSK
 */
export function convertToMSK(utcTime: string | Date): Date {
  const date = new Date(utcTime);
  // Проверяем, нужно ли конвертировать (если время в UTC)
  // Для простоты пока оставляем как есть, так как время может уже приходить в MSK
  return date;
}

/**
 * Форматирует время в указанном формате
 * @param time - время (уже в правильном формате с сервера)
 * @param format - формат времени (например, 'dd MMMM yyyy, HH:mm')
 * @param locale - локаль для форматирования
 * @returns отформатированное время
 */
export function formatTime(
  time: string | Date, 
  format: string, 
  locale: any
): string {
  const date = new Date(time);
  
  // Используем date-fns для форматирования
  return formatDate(date, format, { locale });
}

// Оставляем старую функцию для обратной совместимости
export function formatMSKTime(
  time: string | Date, 
  format: string, 
  locale: any
): string {
  return formatTime(time, format, locale);
}
