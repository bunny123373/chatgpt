import Landing from "@/components/Landing";

/**
 * The public landing page, shown to everyone at "/".
 *
 * It used to redirect signed-in visitors to /chat. It does not any more. A
 * landing page is useful to someone who is already signed in -- it is the
 * public face of the site, reachable from search results and shared URLs -- and
 * the redirect re-fired on every sign-in, pulling people out of the page they
 * had just used to sign in.
 *
 * The app is one click away via "Start chatting", which is never disabled: it
 * needs no account and no auth state.
 */
export default function Page() {
  return <Landing />;
}
