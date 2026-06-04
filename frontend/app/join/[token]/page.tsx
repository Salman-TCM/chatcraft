import JoinPageClient from "./JoinPageClient";

export default function JoinPage({ params }: { params: { token: string } }) {
  return <JoinPageClient token={params.token} />;
}
