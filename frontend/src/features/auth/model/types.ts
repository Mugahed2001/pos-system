export interface LoginPayload {
  username: string;
  password: string;
  pin?: string;
  branchId?: string;
  deviceId?: string;
}

export interface AuthUser {
  id: number | null;
  username: string;
  is_staff: boolean;
  roles: string[];
}

export interface LoginResponse {
  token: string;
  id: number;
  username: string;
  is_staff: boolean;
  roles?: string[];
  branch_id?: string | null;
}

export interface MeResponse {
  id: number;
  username: string;
  is_staff: boolean;
  roles?: string[];
  token: string;
  branch_id?: string | null;
}

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  signIn: (payload: LoginPayload) => Promise<void>;
  signOut: () => Promise<void>;
}
