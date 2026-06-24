export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'parse' | 'config';

export class ApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new ApiError('timeout', 'La requete a pris trop de temps. Reessaie dans un instant.');
    }
    return new ApiError('network', error.message || 'Connexion impossible.');
  }

  return new ApiError('network', 'Connexion impossible.');
}

export function formatApiError(error: ApiError): string {
  switch (error.kind) {
    case 'config':
      return 'Ajoute EXPO_PUBLIC_API_BASE_URL dans le .env local, puis relance Expo.';
    case 'timeout':
      return 'Le serveur ne repond pas assez vite. Verifie ta connexion puis reessaie.';
    case 'http':
      if (error.status && error.status >= 500) {
        return 'Le service est indisponible pour le moment. Reessaie dans quelques instants.';
      }
      return error.message;
    case 'parse':
      return 'La reponse du serveur est inattendue. Le contrat API doit etre verifie.';
    case 'network':
    default:
      return 'Impossible de joindre le serveur. Verifie la connexion ou l URL backend.';
  }
}
