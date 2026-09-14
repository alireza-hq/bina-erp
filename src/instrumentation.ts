import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRuntimeConfig } = await import("@/lib/runtime-config");
    const { operationalLog } = await import("@/lib/operational-log");
    validateRuntimeConfig();
    operationalLog("runtime.configuration_validated");
  }
}
export const onRequestError: Instrumentation.onRequestError = async (error) => {
  const { operationalLog } = await import("@/lib/operational-log");
  operationalLog("request.unhandled_failure", error);
};
