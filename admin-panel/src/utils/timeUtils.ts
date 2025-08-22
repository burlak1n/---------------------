import { format as formatDate } from 'date-fns';

/**
 * Конвертирует локальное время пользователя в UTC для отправки на сервер
 * @param localTime - время в локальном часовом поясе пользователя
 * @returns строка в ISO формате UTC
 */
export function localToUTC(localTime: string | Date): string {
  const date = new Date(localTime);
  return date.toISOString();
}

/**
 * Конвертирует UTC время с сервера в локальное время для отображения
 * @param utcTime - время в UTC с сервера
 * @returns строка в формате YYYY-MM-DDTHH:mm для datetime-local input
 */
export function utcToLocalInput(utcTime: string | Date): string {
  const date = new Date(utcTime);
  return date.toISOString().slice(0, 16);
}

/**
 * Форматирует время в указанном формате
 * @param time - время
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
  return formatDate(date, format, { locale });
}

// Функции для обратной совместимости
export function convertToMSK(utcTime: string | Date): Date {
  return new Date(utcTime);
}

export function convertUTCToMSKForInput(utcTime: string | Date): string {
  return utcToLocalInput(utcTime);
}

export function convertMSKToUTC(mskTime: string | Date): string {
  return localToUTC(mskTime);
}

export function convertToInputFormat(time: string | Date): string {
  return utcToLocalInput(time);
}

export function convertToServerFormat(time: string | Date): string {
  return localToUTC(time);
}

export function formatMSKTime(
  time: string | Date, 
  format: string, 
  locale: any
): string {
  return formatTime(time, format, locale);
}
