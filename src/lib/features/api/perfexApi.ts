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
        getTasks: builder.query<any, { page?: number; limit?: number } | void>({
            query: (arg) => {
                if (!arg) return "tasks";
                return `tasks?page=${arg.page || 1}&limit=${arg.limit || 50}`;
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
    useSyncStaffMutation,
} = perfexApi;
