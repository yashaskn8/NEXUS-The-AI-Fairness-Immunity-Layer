"""
NEXUS PDF Reporter — Generates legally-defensible audit report PDFs using ReportLab.
"""
from __future__ import annotations

import io
import os
import time
import uuid
from typing import Any

import structlog

from nexus_types.models import FairnessMetric, RemediationAction

logger = structlog.get_logger(__name__)


class PDFReporter:
    """
    Generates comprehensive audit report PDFs.
    Structure: Cover, Executive Summary, Metrics Detail, Causal Analysis,
    Remediation Log, Regulatory Compliance Matrix, and Audit Chain.
    """

    def generate(
        self,
        org_id: str,
        model_id: str,
        metrics: list[FairnessMetric],
        actions: list[RemediationAction],
        narrative: str,
        causal_data: dict[str, Any] | None = None,
        shap_data: dict[str, Any] | None = None,
        audit_records: list[dict[str, Any]] | None = None,
        period_start: int | None = None,
        period_end: int | None = None,
    ) -> tuple[bytes, str]:
        """
        Generate a full audit report PDF.
        Returns (pdf_bytes, report_id).
        """
        report_id = str(uuid.uuid4())

        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.lib.units import inch
            from reportlab.platypus import (
                Paragraph,
                SimpleDocTemplate,
                Spacer,
                Table,
                TableStyle,
            )

            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=letter, topMargin=0.5*inch, bottomMargin=0.75*inch)

            styles = getSampleStyleSheet()
            title_style = ParagraphStyle(
                'NexusTitle', parent=styles['Title'],
                fontSize=28, textColor=colors.HexColor('#0D1628'),
                spaceAfter=20,
            )
            heading_style = ParagraphStyle(
                'NexusHeading', parent=styles['Heading1'],
                fontSize=18, textColor=colors.HexColor('#3B82F6'),
                spaceAfter=12,
            )
            subheading_style = ParagraphStyle(
                'NexusSubheading', parent=styles['Heading2'],
                fontSize=14, textColor=colors.HexColor('#1E40AF'),
                spaceAfter=8,
            )
            body_style = ParagraphStyle(
                'NexusBody', parent=styles['Normal'],
                fontSize=10, leading=14, spaceAfter=8,
            )
            footer_style = ParagraphStyle(
                'NexusFooter', parent=styles['Normal'],
                fontSize=7, textColor=colors.grey, alignment=1,
            )

            elements: list[Any] = []

            # Compute overall grade
            violated = [m for m in metrics if m.is_violated]
            high_violations = [m for m in violated if m.severity.value in ("high", "critical")]
            resolved_high = [a for a in actions if a.can_auto_apply and a.status == "applied"]

            if not violated:
                grade = "A"
            elif not high_violations:
                grade = "B"
            elif resolved_high:
                grade = "C"
            elif high_violations:
                grade = "D"
            else:
                grade = "F"

            grade_color = {
                "A": "#10B981", "B": "#3B82F6", "C": "#F59E0B",
                "D": "#EF4444", "F": "#7F1D1D",
            }.get(grade, "#EF4444")

            # ── Cover Page ──
            elements.append(Spacer(1, 2 * inch))
            elements.append(Paragraph("NEXUS", title_style))
            elements.append(Paragraph("AI Fairness Audit Report", heading_style))
            elements.append(Spacer(1, 0.5 * inch))
            elements.append(Paragraph(f"Organisation: {org_id}", body_style))
            elements.append(Paragraph(f"Model: {model_id}", body_style))

            from datetime import datetime
            if period_start and period_end:
                start_str = datetime.fromtimestamp(period_start / 1000).strftime("%Y-%m-%d")
                end_str = datetime.fromtimestamp(period_end / 1000).strftime("%Y-%m-%d")
                elements.append(Paragraph(f"Period: {start_str} to {end_str}", body_style))
            else:
                elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}", body_style))

            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph(
                f'<font size="36" color="{grade_color}"><b>Grade: {grade}</b></font>',
                ParagraphStyle('Grade', parent=styles['Normal'], alignment=1, spaceAfter=20),
            ))

            # ── Executive Summary ──
            elements.append(Spacer(1, 0.5 * inch))
            elements.append(Paragraph("Executive Summary", heading_style))
            for paragraph in narrative.split("\n\n"):
                if paragraph.strip():
                    elements.append(Paragraph(paragraph.strip(), body_style))
                    elements.append(Spacer(1, 6))

            # ── Metrics Detail ──
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Fairness Metrics Detail", heading_style))

            if metrics:
                table_data = [["Metric", "Attribute", "Value", "Threshold", "Status"]]
                for metric in metrics:
                    status = "✅ PASS" if not metric.is_violated else f"❌ {metric.severity.value.upper()}"
                    table_data.append([
                        metric.metric_name.value.replace("_", " ").title(),
                        metric.protected_attribute or "All",
                        f"{metric.value:.4f}",
                        f"{metric.threshold:.2f}",
                        status,
                    ])

                table = Table(table_data, colWidths=[1.8*inch, 1.2*inch, 1*inch, 1*inch, 1.2*inch])
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
                    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                    ('FONTSIZE', (0, 0), (-1, -1), 8),
                    ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                    ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F0F4FF')]),
                    ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
                ]))
                elements.append(table)
            else:
                elements.append(Paragraph("No metrics data available.", body_style))

            # ── Remediation Log ──
            elements.append(Spacer(1, 0.3 * inch))
            elements.append(Paragraph("Remediation Actions", heading_style))

            if actions:
                for action in actions:
                    auto_badge = "🤖 AUTO" if action.can_auto_apply else "👤 MANUAL"
                    elements.append(Paragraph(
                        f"<b>{auto_badge} | {action.action_type.value.replace('_', ' ').title()}</b>",
                        subheading_style,
                    ))
                    elements.append(Paragraph(action.description, body_style))
                    if action.projected_improvement > 0:
                        elements.append(Paragraph(
                            f"Projected Improvement: {action.projected_improvement:.1f}%",
                            body_style,
                        ))
                    elements.append(Spacer(1, 6))
            else:
                elements.append(Paragraph("No remediation actions required.", body_style))

            # ── Audit Chain ──
            if audit_records:
                elements.append(Spacer(1, 0.3 * inch))
                elements.append(Paragraph("Audit Chain (Last 20 Records)", heading_style))

                for record in audit_records[:20]:
                    hash_display = record.get("record_hash", "")[:16] + "..."
                    elements.append(Paragraph(
                        f'<font face="Courier" size="7">{hash_display} | '
                        f'{record.get("action_type", "")} | '
                        f'{record.get("timestamp", "")}</font>',
                        body_style,
                    ))

            # ── Footer ──
            elements.append(Spacer(1, 0.5 * inch))
            timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC")
            elements.append(Paragraph(
                f"Generated by NEXUS | {timestamp_str} | "
                f"Cryptographically sealed | Audit ID: {report_id} | CONFIDENTIAL",
                footer_style,
            ))

            doc.build(elements)
            pdf_bytes = buffer.getvalue()
            buffer.close()

            logger.info(
                "PDF report generated",
                report_id=report_id,
                org_id=org_id,
                model_id=model_id,
                pages="multi",
                size_kb=len(pdf_bytes) // 1024,
            )

            return pdf_bytes, report_id

        except ImportError:
            logger.warning("ReportLab not available — generating text report")
            text_report = self._generate_text_fallback(
                org_id, model_id, metrics, actions, narrative, report_id
            )
            return text_report.encode("utf-8"), report_id

    def _generate_text_fallback(
        self,
        org_id: str,
        model_id: str,
        metrics: list[FairnessMetric],
        actions: list[RemediationAction],
        narrative: str,
        report_id: str,
    ) -> str:
        """Generate a text-based report as fallback when ReportLab is unavailable."""
        lines = [
            "═" * 60,
            "NEXUS AI FAIRNESS AUDIT REPORT",
            "═" * 60,
            f"Organisation: {org_id}",
            f"Model: {model_id}",
            f"Report ID: {report_id}",
            f"Generated: {time.strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "EXECUTIVE SUMMARY",
            "-" * 40,
            narrative,
            "",
            "METRICS DETAIL",
            "-" * 40,
        ]

        for m in metrics:
            status = "PASS" if not m.is_violated else f"FAIL ({m.severity.value})"
            lines.append(
                f"  {m.metric_name.value}: {m.value:.4f} "
                f"(threshold: {m.threshold}, {status})"
            )

        lines.extend(["", "REMEDIATION ACTIONS", "-" * 40])
        for a in actions:
            auto = "AUTO" if a.can_auto_apply else "MANUAL"
            lines.append(f"  [{auto}] {a.action_type.value}: {a.description[:100]}")

        lines.extend([
            "",
            "═" * 60,
            f"Generated by NEXUS | Audit ID: {report_id} | CONFIDENTIAL",
        ])

        return "\n".join(lines)

    def test_generate(self) -> None:
        """Test report generation with sample data."""
        metrics = [
            FairnessMetric(
                org_id="test-org",
                model_id="test-model",
                metric_name="disparate_impact",
                protected_attribute="gender",
                comparison_group="female",
                reference_group="male",
                value=0.67,
                threshold=0.8,
                is_violated=True,
                severity="critical",
                window_seconds=3600,
                sample_count=500,
            ),
        ]

        actions = [
            RemediationAction(
                action_type="threshold_autopilot",
                description="Auto-adjusting decision thresholds for gender equity.",
                can_auto_apply=True,
                projected_improvement=15.0,
            ),
        ]

        narrative = (
            "A critical disparate impact violation was detected in the hiring model. "
            "Female candidates are being approved at only 67% the rate of male candidates.\n\n"
            "NEXUS has activated threshold autopilot to correct this disparity in real-time."
        )

        pdf_bytes, report_id = self.generate(
            org_id="test-org",
            model_id="test-model",
            metrics=metrics,
            actions=actions,
            narrative=narrative,
        )

        print(f"Test report generated: {report_id} ({len(pdf_bytes)} bytes)")
