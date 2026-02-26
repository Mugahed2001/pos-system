import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { ENV } from "../../app/config/env";
import { AUTH_TOKEN_KEY, DEVICE_TOKEN_KEY } from "../constants/keys";
import { storage } from "./storage";

declare module "axios" {
  export interface AxiosRequestConfig<D = any> {
    skipAuth?: boolean;
    _unauthorizedHandled?: boolean;
  }

  export interface InternalAxiosRequestConfig<D = any> {
    skipAuth?: boolean;
    _unauthorizedHandled?: boolean;
  }
}

type RequestConfigWithAuth = InternalAxiosRequestConfig & {
  skipAuth?: boolean;
  _unauthorizedHandled?: boolean;
};

type UnauthorizedHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedInFlight: Promise<void> | null = null;

export const apiClient = axios.create({
  baseURL: ENV.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use(async (config) => {
  const requestConfig = config as RequestConfigWithAuth;
  if (requestConfig.skipAuth) {
    return config;
  }

  if (!config.headers.Authorization) {
    const token = await storage.getString(AUTH_TOKEN_KEY);
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
  }

  const storedDeviceToken = await storage.getString(DEVICE_TOKEN_KEY);
  const deviceToken = storedDeviceToken || ENV.defaultDeviceToken;
  if (deviceToken) {
    config.headers["X-Device-Token"] = deviceToken;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const requestConfig = error.config as RequestConfigWithAuth | undefined;
    const skipAuth = Boolean(requestConfig?.skipAuth);

    if (
      status === 401 &&
      !skipAuth &&
      unauthorizedHandler &&
      requestConfig &&
      !requestConfig._unauthorizedHandled
    ) {
      requestConfig._unauthorizedHandled = true;
      if (!unauthorizedInFlight) {
        unauthorizedInFlight = Promise.resolve(unauthorizedHandler()).finally(() => {
          unauthorizedInFlight = null;
        });
      }
      await unauthorizedInFlight;
    }

    return Promise.reject(error);
  },
);
