import type { ApiErrorBody, ErrorCode, TextParams } from '@cryptomeme/shared';

/**
 * Corps d'erreur de l'API : un code stable (traduit par le site), ses paramètres et le texte français de repli.
 * `throw new BadRequestException(apiError('INSUFFICIENT_CASH', 'Cash insuffisant'))`
 */
export const apiError = (code: ErrorCode, message: string, params?: TextParams): ApiErrorBody => (params ? { code, message, params } : { code, message });
