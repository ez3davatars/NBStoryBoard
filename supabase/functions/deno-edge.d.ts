declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
  }
}

declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module "https://esm.sh/@supabase/supabase-js@2.39.3" {
  export function createClient(
    supabaseUrl: string,
    supabaseKey: string,
    options?: {
      global?: {
        headers?: Record<string, string>;
      };
    }
  ): any;
}
