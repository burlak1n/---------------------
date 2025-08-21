/**
 * Конвертирует UTC время в MSK (+3)
 * @param utcTime - время в UTC
 * @returns время в MSK
 */
export function convertToMSK(utcTime: string | Date): Date {
  const date = new Date(utcTime);
  // Добавляем 3 часа для конвертации в MSK
  date.setHours(date.getHours() + 3);
  return date;
}

/**
 * Форматирует время в MSK с учетом временной зоны
 * @param utcTime - время в UTC
 * @param format - формат времени (например, 'dd MMMM yyyy, HH:mm')
 * @param locale - локаль для форматирования
 * @returns отформатированное время в MSK
 */
export function formatMSKTime(
  utcTime: string | Date, 
  format: string, 
  locale: any
): string {
  const mskTime = convertToMSK(utcTime);
  
  // Используем date-fns для форматирования
  const { format: formatDate } = require('date-fns');
  return formatDate(mskTime, format, { locale });
}
