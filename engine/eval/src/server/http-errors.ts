export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "CASE_NOT_FOUND"
  | "GOLDEN_NOT_CERTIFIED"
  | "INVALID_PROPOSAL"
  | "GRADING_FAILED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
  };
};

export function apiError(code: ApiErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
