import type { HttpClient } from "../http.js";
import type {
  CreateTemplateParams,
  RequestOptions,
  TemplateSummary,
  UpdateTemplateParams,
} from "../types.js";

export class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a new prompt template.
   *
   * Auth: Supabase JWT or API key (`rsk_...`)
   * Templates are scoped to the authenticated owner.
   *
   * @example
   * ```ts
   * const template = await client.templates.create({
   *   name: "support-agent",
   *   system: "You are a helpful customer support agent for {{company}}.",
   *   variables: ["company"],
   *   model: "openai/gpt-4o-mini",
   * });
   * console.log(template.id);
   * ```
   */
  async create(params: CreateTemplateParams, opts?: RequestOptions): Promise<TemplateSummary> {
    return this.http.post<TemplateSummary>("/v1/templates", params, opts);
  }

  /**
   * List all templates belonging to the authenticated owner.
   *
   * Auth: Supabase JWT or API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const templates = await client.templates.list();
   * for (const t of templates) {
   *   console.log(t.id, t.name);
   * }
   * ```
   */
  async list(opts?: RequestOptions): Promise<TemplateSummary[]> {
    return this.http.get<TemplateSummary[]>("/v1/templates", opts);
  }

  /**
   * Get a single template by UUID.
   * The template must belong to the authenticated owner.
   *
   * Auth: Supabase JWT or API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const template = await client.templates.get("uuid-here");
   * console.log(template.system);
   * ```
   */
  async get(templateId: string, opts?: RequestOptions): Promise<TemplateSummary> {
    return this.http.get<TemplateSummary>(`/v1/templates/${templateId}`, opts);
  }

  /**
   * Update a template. Only provided fields are changed.
   * The template must belong to the authenticated owner.
   *
   * Auth: Supabase JWT or API key (`rsk_...`)
   *
   * @example
   * ```ts
   * const updated = await client.templates.update("uuid-here", {
   *   system: "You are a helpful agent for {{company}}. Be concise.",
   * });
   * ```
   */
  async update(
    templateId: string,
    params: UpdateTemplateParams,
    opts?: RequestOptions,
  ): Promise<TemplateSummary> {
    return this.http.patch<TemplateSummary>(`/v1/templates/${templateId}`, params, opts);
  }

  /**
   * Delete a template (hard delete).
   * The template must belong to the authenticated owner.
   *
   * Auth: Supabase JWT or API key (`rsk_...`)
   *
   * @example
   * ```ts
   * await client.templates.delete("uuid-here");
   * ```
   */
  async delete(templateId: string, opts?: RequestOptions): Promise<void> {
    return this.http.delete(`/v1/templates/${templateId}`, opts);
  }
}
