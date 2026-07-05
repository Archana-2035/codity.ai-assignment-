export const getErrorMsg = (err: any, fallback: string): string => {
  const errorData = err?.response?.data?.error;
  if (typeof errorData === 'string') return errorData;
  if (errorData && typeof errorData === 'object') {
    return errorData.message || errorData.code || fallback;
  }
  return err?.message || fallback;
};
