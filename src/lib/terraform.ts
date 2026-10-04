import type { Choices } from "./demo.ts";
export function complete(c: Choices) {
  return (
    ["ap-northeast-1", "ap-northeast-2"].includes(c.region) &&
    ["public", "private"].includes(c.visibility) &&
    ["single", "multi"].includes(c.availability)
  );
}
export function generateTerraform(c: Choices): string {
  if (!complete(c)) throw new Error("필수 질문에 모두 답변하세요.");
  const count = c.availability === "multi" ? 2 : 1;
  // ponytail: guided VPC/subnet template only; replace with reviewed AI output when the API exists.
  return `# PieckPick 데모 템플릿 · 실제 AI 생성/검증/적용되지 않았습니다.
# 요구사항 자유 입력은 보존되며 이 코드에 자동 반영되지 않습니다.
# 샘플은 VPC/Subnet만 포함합니다. ALB/ECS/NAT/IAM/보안 규칙은 별도 설계가 필요합니다.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" { region = "${c.region}" }
resource "aws_vpc" "foundation" {
  cidr_block = "10.20.0.0/16"
  enable_dns_support = true
  enable_dns_hostnames = true
  tags = { Name = "freesia-design" }
}
resource "aws_subnet" "workload" {
  count = ${count}
  vpc_id = aws_vpc.foundation.id
  cidr_block = cidrsubnet(aws_vpc.foundation.cidr_block, 8, count.index)
  availability_zone = ["${c.region}a", "${c.region}c"][count.index]
  map_public_ip_on_launch = ${c.visibility === "public"}
}${
    c.visibility === "public"
      ? `
resource "aws_internet_gateway" "public" { vpc_id = aws_vpc.foundation.id }
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.foundation.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.public.id
  }
}
resource "aws_route_table_association" "public" {
  count = ${count}
  subnet_id = aws_subnet.workload[count.index].id
  route_table_id = aws_route_table.public.id
}`
      : "\n# Private subnet: NAT/외부 통신 경로는 이 템플릿에 포함하지 않습니다."
  }
output "vpc_id" { value = aws_vpc.foundation.id }
output "subnet_ids" { value = aws_subnet.workload[*].id }
`;
}
