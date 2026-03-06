import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// Define a service using a base URL and expected endpoints
export const perfexApi = createApi({
    reducerPath: "perfexApi",
    // We point RTK Query at our Next.js API route proxies, NOT directly at Perfex.
    // This keeps the PERFEX_ADMIN_TOKEN securely on the server.
    baseQuery: fetchBaseQuery({ baseUrl: "/api/" }),
    tagTypes: ["Staff", "Customers", "Contacts", "Tasks", "Timesheets", "Projects"],
    endpoints: (builder) => ({
        getStaff: builder.query<any, void>({
            query: () => "staff",
            providesTags: ["Staff"],
        }),
        getStaffById: builder.query<any, string | number>({
            query: (id) => `staff/${id}`,
            providesTags: (result, error, id) => [{ type: "Staff", id }],
        }),
        syncStaff: builder.mutation<any, void>({
            query: () => ({
                url: "staff/sync",
                method: "POST",
            }),
            invalidatesTags: ["Staff"],
        }),
        getCustomers: builder.query<any, void>({
            query: () => "customers",
            providesTags: ["Customers"],
        }),
        getContacts: builder.query<any, void>({
            query: () => "contacts",
            providesTags: ["Contacts"],
        }),
        getTasks: builder.query<any, { page?: number; limit?: number; staff?: string; date?: string } | void>({
            query: (arg) => {
                if (!arg) return "tasks";
                const params = new URLSearchParams();
                if (arg.page) params.set('page', String(arg.page));
                if (arg.limit) params.set('limit', String(arg.limit));
                if (arg.staff) params.set('staff', arg.staff);
                if (arg.date) params.set('date', arg.date);
                return `tasks?${params.toString()}`;
            },
            providesTags: ["Tasks"],
        }),
        getProjects: builder.query<any, void>({
            query: () => "projects",
            providesTags: ["Projects"],
        }),
        getTimesheets: builder.query<any, { page?: number; limit?: number } | void>({
            query: (arg) => {
                if (!arg) return "timesheets";
                return `timesheets?page=${arg.page || 1}&limit=${arg.limit || 50}`;
            },
            providesTags: ["Timesheets"],
        }),
        getServiceReportsByTaskId: builder.query<any, string>({
            query: (taskId) => `service-reports?taskId=${taskId}`,
            providesTags: ["Timesheets"], // Or cache by Task instead depending on your strategy
        })
    }),
});

// Export hooks for usage in functional components, which are
// auto-generated based on the defined endpoints
export const {
    useGetStaffQuery,
    useGetStaffByIdQuery,
    useGetCustomersQuery,
    useGetContactsQuery,
    useGetTasksQuery,
    useGetProjectsQuery,
    useGetTimesheetsQuery,
    useGetServiceReportsByTaskIdQuery,
    useSyncStaffMutation,
} = perfexApi;
