import axios from 'axios';
import type { ApiResponse, JsonSchema, TransformTestRequest, TransformTestResult, MemberData, SchemaVersionInfo } from '../types/index';

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

// ---- Point Type API (积分类型管理) ----

export interface PointTypeDefinition {
  id?: number;
  programCode: string;
  typeCode: string;
  typeName: string;
  description?: string;
  pointCategory?: string;
  isRedeemable: boolean;
  isTierCalc: boolean;
  isTransferable: boolean;
  allowNegative: boolean;
  allowRepay: boolean;
  expiryMode: string;
  expiryValue: number;
  isVisible: boolean;
  sortOrder: number;
  status?: string;
}

export async function getPointTypes(programCode: string) {
  const { data } = await api.get<ApiResponse<PointTypeDefinition[]>>('/point-types', { params: { programCode } });
  return data.data;
}

export async function getRedeemableTypes(programCode: string) {
  const { data } = await api.get<ApiResponse<PointTypeDefinition[]>>('/point-types/redeemable', { params: { programCode } });
  return data.data;
}

export async function createPointType(type: PointTypeDefinition) {
  const { data } = await api.post<ApiResponse<PointTypeDefinition>>('/point-types', type);
  return data.data;
}

export async function updatePointType(typeCode: string, programCode: string, type: PointTypeDefinition) {
  const { data } = await api.put<ApiResponse<PointTypeDefinition>>(`/point-types/${typeCode}`, type, { params: { programCode } });
  return data.data;
}

export async function deletePointType(typeCode: string, programCode: string) {
  const { data } = await api.delete<ApiResponse<null>>(`/point-types/${typeCode}`, { params: { programCode } });
  return data;
}

// ---- Variable API (变量管理) ----

export interface RuleVariableDefinition {
  id?: string;
  programCode: string;
  varCode: string;
  varName: string;
  varType: string;
  expression: string;
  description?: string;
  status?: string;
}

export async function getVariables(programCode: string) {
  const { data } = await api.get<ApiResponse<RuleVariableDefinition[]>>('/variables', { params: { programCode } });
  return data.data;
}

export async function getAvailablePointTypes(programCode: string) {
  const { data } = await api.get<ApiResponse<{ typeCode: string; typeName: string }[]>>('/variables/available-types', { params: { programCode } });
  return data.data;
}

export async function createVariable(variable: RuleVariableDefinition) {
  const { data } = await api.post<ApiResponse<RuleVariableDefinition>>('/variables', variable);
  return data.data;
}

export async function updateVariable(varCode: string, programCode: string, variable: RuleVariableDefinition) {
  const { data } = await api.put<ApiResponse<RuleVariableDefinition>>(`/variables/${varCode}`, variable, { params: { programCode } });
  return data.data;
}

export async function deleteVariable(varCode: string, programCode: string) {
  const { data } = await api.delete<ApiResponse<null>>(`/variables/${varCode}`, { params: { programCode } });
  return data;
}

export async function validateExpression(programCode: string, expression: string) {
  const { data } = await api.post<ApiResponse<{ valid: boolean; message: string; extractedTypes: string[] }>>('/variables/validate', { programCode, expression });
  return data.data;
}

export async function calculateVariable(programCode: string, varCode: string, memberId: number, windowDays?: number) {
  const { data } = await api.post<ApiResponse<{ varCode: string; value: number; expression: string; details: Record<string, number> }>>('/variables/calculate', { programCode, varCode, memberId, windowDays: windowDays ?? 365 });
  return data.data;
}

export default api;