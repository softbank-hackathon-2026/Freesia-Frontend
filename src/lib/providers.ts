// Unknown sources remain unconfirmed, including responses from older servers.
export function getInfraProvider(value: string | null | undefined) {
  switch (value) {
    case "aws": return { key: "aws", label: "AWS", icon: "/providers/aws.png" };
    case "onprem": return { key: "onprem", label: "온프레미스", icon: "/providers/on-premise.png" };
    case "gcp": return { key: "gcp", label: "GCP", icon: "/providers/gcp.png" };
    case "azure": return { key: "azure", label: "Azure", icon: "/providers/azure.png" };
    default: return { key: "unknown", label: "환경 미확인", icon: null };
  }
}
