import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/**
 * RTK Query slice for our own admin compliance + overview endpoints.
 *
 * Kept separate from `perfexApi` (which proxies the Perfex CRM) because these are
 * first-party Next.js API routes with their own cache-invalidation graph. Every
 * write invalidates exactly the views it can affect, so a verify/reject/assign
 * refetches just that staff member's detail, the staff list, and the overview —
 * not the whole app.
 */
export const complianceApi = createApi({
  reducerPath: "complianceApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api/admin/" }),
  tagTypes: ["Overview", "ComplianceStaff", "ComplianceStaffDetail", "Requirement", "Retention"],
  endpoints: (builder) => ({
    // --- Overview (dashboard landing) ---------------------------------------
    getOverview: builder.query<any, void>({
      query: () => "overview",
      providesTags: [{ type: "Overview", id: "SUMMARY" }],
    }),

    // --- Staff compliance table --------------------------------------------
    getComplianceStaff: builder.query<any, { search?: string; page?: number; limit?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        params.set("page", String(arg?.page || 1));
        params.set("limit", String(arg?.limit || 20));
        if (arg?.search) params.set("search", arg.search);
        return `compliance/staff?${params.toString()}`;
      },
      providesTags: [{ type: "ComplianceStaff", id: "LIST" }],
    }),

    // --- One staff member's requirement cards ------------------------------
    getStaffCompliance: builder.query<any, string>({
      query: (staffId) => `compliance/staff/${encodeURIComponent(staffId)}`,
      providesTags: (_r, _e, staffId) => [{ type: "ComplianceStaffDetail", id: staffId }],
    }),

    // --- Requirement catalog ------------------------------------------------
    getRequirements: builder.query<any, void>({
      query: () => "compliance/requirements",
      providesTags: [{ type: "Requirement", id: "LIST" }],
    }),

    // --- Retention overview -------------------------------------------------
    getRetention: builder.query<any, void>({
      query: () => "compliance/retention",
      providesTags: [{ type: "Retention", id: "OVERVIEW" }],
    }),

    // === Mutations ==========================================================
    // A per-requirement write (verify / reject / set_expiry / add_evidence /
    // assign / unassign). Refreshes that staff member's cards, the staff list
    // (summary badges change), and the org overview.
    staffComplianceAction: builder.mutation<any, { staffId: string; requirementKey: string; body: Record<string, any> }>({
      query: ({ staffId, requirementKey, body }) => ({
        url: `compliance/staff/${encodeURIComponent(staffId)}/${encodeURIComponent(requirementKey)}`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { staffId }) => [
        { type: "ComplianceStaffDetail", id: staffId },
        { type: "ComplianceStaff", id: "LIST" },
        { type: "Overview", id: "SUMMARY" },
      ],
    }),

    createRequirement: builder.mutation<any, Record<string, any>>({
      query: (body) => ({ url: "compliance/requirements", method: "POST", body }),
      invalidatesTags: [
        { type: "Requirement", id: "LIST" },
        { type: "ComplianceStaff", id: "LIST" },
        { type: "Overview", id: "SUMMARY" },
      ],
    }),

    updateRequirement: builder.mutation<any, { key: string; patch: Record<string, any> }>({
      query: ({ key, patch }) => ({
        url: `compliance/requirements/${encodeURIComponent(key)}`,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: [
        { type: "Requirement", id: "LIST" },
        { type: "ComplianceStaff", id: "LIST" },
        { type: "Overview", id: "SUMMARY" },
      ],
    }),

    deleteRequirement: builder.mutation<any, string>({
      query: (key) => ({ url: `compliance/requirements/${encodeURIComponent(key)}`, method: "DELETE" }),
      invalidatesTags: [
        { type: "Requirement", id: "LIST" },
        { type: "ComplianceStaff", id: "LIST" },
        { type: "Overview", id: "SUMMARY" },
      ],
    }),

    // Disposal. A dry-run preview mutates nothing, so it invalidates nothing;
    // a real run changes retention + overview posture.
    disposeCompliance: builder.mutation<any, { dryRun: boolean; staffId?: string }>({
      query: (body) => ({ url: "compliance/dispose", method: "POST", body }),
      invalidatesTags: (_r, _e, arg) =>
        arg.dryRun
          ? []
          : [
              { type: "Retention", id: "OVERVIEW" },
              { type: "ComplianceStaff", id: "LIST" },
              { type: "Overview", id: "SUMMARY" },
            ],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetComplianceStaffQuery,
  useGetStaffComplianceQuery,
  useGetRequirementsQuery,
  useGetRetentionQuery,
  useStaffComplianceActionMutation,
  useCreateRequirementMutation,
  useUpdateRequirementMutation,
  useDeleteRequirementMutation,
  useDisposeComplianceMutation,
} = complianceApi;
