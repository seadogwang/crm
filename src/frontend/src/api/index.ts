import axios from 'axios';
import type { ApiResponse, JsonSchema, TransformTestRequest, TransformTestResult, MemberData, SchemaVersionInfo } from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: inject tenant and trace headers
api.interceptors.request.use((config) => {
  const programCode = sessionStorage.getItem('current_program_code') || 'PROG001';
  config.headers['X-Program-Code'] = programCode;
  config.headers['X-Trace-Id'] = crypto.randomUUID?.() || Date.now().toString(36);
  const token = sessionStorage.getItem('auth_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ---- Schema API ----

export async function getSchema(entityType: string) {
  const { data } = await api.get<ApiResponse<{ schema: JsonSchema; version: string; entity_type: string }>>(
    `/schemas/${entityType}`
  );
  return data.data;
}

export async function saveSchema(entityType: string, schema: JsonSchema) {
  const { data } = await api.put<ApiResponse<null>>(`/schemas/${entityType}`, { field_schema: schema });
  return data;
}

export async function checkFieldDeprecation(entityType: string, field: string) {
  const { data } = await api.get<ApiResponse<{
    field: string;
    safe_to_deprecate: boolean;
    referencing_rules: { rule_code: string; rule_name: string; version: number }[];
  }>>(`/schemas/${entityType}/deprecation-check`, { params: { field } });
  return data.data;
}

// ---- Member API ----

export async function getMember(memberId: number) {
  const { data } = await api.get<ApiResponse<MemberData>>(`/members/${memberId}`);
  return data.data;
}

export async function updateMember(memberId: number, extAttributes: Record<string, unknown>) {
  const { data } = await api.put<ApiResponse<MemberData>>(`/members/${memberId}`, {
    ext_attributes: extAttributes,
  });
  return data.data;
}

// ---- Scripting Transformer API ----

export async function testTransform(req: TransformTestRequest) {
  const { data } = await api.post<ApiResponse<TransformTestResult>>(`/open/spi/${req.channel}/test/transform`, req);
  return data.data;
}

export async function testChannelTransform(sourceJson: string, mappings: any[], script: string) {
  const { data } = await api.post<ApiResponse<{ result: any }>>('/admin/channels/test-transform', {
    sourceJson, mappings, script,
  });
  return data.data;
}

export default api;