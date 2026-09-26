import AuthGate from "@/components/AuthGate";

/** The app itself. Reached from the landing page; works signed out, anonymously. */
export default function ChatPage() {
  return <AuthGate />;
}
