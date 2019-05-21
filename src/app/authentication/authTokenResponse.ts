export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: number;
  scope: string;
  user: string;
  date: Date;
}

