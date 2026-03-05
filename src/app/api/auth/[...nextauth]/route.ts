import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongoose";
import User from "@/models/User";

export const authOptions: NextAuthOptions = {
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email", placeholder: "admin@pristine.com" },
                password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
                if (!credentials?.email || !credentials.password) {
                    throw new Error("Missing email or password");
                }

                await dbConnect();

                // 1. Verify user exists
                const user = await User.findOne({ email: credentials.email }).select("+password");
                if (!user) {
                    throw new Error("Invalid credentials");
                }

                // 2. Verify password
                const isValid = await bcrypt.compare(credentials.password, user.password!);
                if (!isValid) {
                    throw new Error("Invalid credentials");
                }

                // 3. Return user object mapping to NextAuth session
                return {
                    id: user._id.toString(),
                    email: user.email,
                    name: user.name,
                    role: user.role, // Attach our custom admin role to token
                } as any;
            },
        }),
    ],
    session: {
        strategy: "jwt",
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.role = (user as any).role;
                token.id = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                (session.user as any).role = token.role;
                (session.user as any).id = token.id;
            }
            return session;
        },
    },
    pages: {
        signIn: "/login",
    },
    secret: process.env.NEXTAUTH_SECRET || "pristine-fallback-secret-for-dev",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
