#!/usr/bin/env python3
"""
NEXUS Live Demo Orchestrator
Sets up the demo environment, generates bias events, runs the intercept pipeline, 
and prints an ASCII status board.
"""
import asyncio
import os
import sys
import time
import httpx
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

# Import the seed script. Assuming PYTHONPATH is set to include root/scripts
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
try:
    from scripts.seed_hiring_bias import HiringSim
except ImportError:
    print("Could not import scripts.seed_hiring_bias. Is it present?")
    sys.exit(1)

console = Console()
GATEWAY_URL = os.environ.get("NEXUS_GATEWAY_URL", "http://localhost:8080")
API_KEY = "nxs_demo_test_key_1234"

async def check_health() -> bool:
    """Check if the NEXUS API gateway is up."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"{GATEWAY_URL}/v1/health")
            return resp.status_code == 200
    except BaseException:
        return False

async def generate_and_send_events(num_events: int = 50):
    """Generate events via the simulator and send them to the Intercept API."""
    sim = HiringSim(org_id="demo-org", model_id="hiring-v2")
    events = []
    
    # Generate
    for _ in range(num_events):
        evt = sim.generate_applicant()
        events.append(evt)
        
    intercepted_count = 0
    total_latency = 0.0

    async with httpx.AsyncClient() as client:
        for evt in events:
            # Send to interception endpoint
            headers = {"Authorization": f"Bearer {API_KEY}"}
            start_time = time.time()
            try:
                resp = await client.post(f"{GATEWAY_URL}/v1/intercept", json=evt, headers=headers)
                latency = time.time() - start_time
                total_latency += latency
                
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("was_intercepted"):
                        intercepted_count += 1
            except BaseException:
                pass # Silent fail for demo if gateway not reachable
                
    avg_latency = (total_latency / num_events) * 1000 if num_events > 0 else 0
    return num_events, intercepted_count, avg_latency

async def run_demo():
    console.print(Panel.fit("[bold blue]NEXUS Demo Orchestrator\nInitializing AI Fairness Suite...[/bold blue]"))
    
    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), console=console) as progress:
        task1 = progress.add_task("[yellow]Checking Gateway Health...", total=None)
        
        # Wait up to 15 seconds for Gateway
        is_healthy = False
        for _ in range(15):
             if await check_health():
                 is_healthy = True
                 break
             await asyncio.sleep(1)
             
        if not is_healthy:
            progress.update(task1, description="[red]Gateway Unreachable![/red]")
            console.print("[red]Ensure docker-compose is running ('docker-compose up -d').[/red]")
            # We continue anyway to simulate the generation conceptually if they just want to see it run
        else:
             progress.update(task1, description="[green]Gateway Healthy![/green]")

        task2 = progress.add_task("[yellow]Running Hiring Bias Scenario...", total=None)
        num_events, intercepted_count, avg_latency = await generate_and_send_events(100)
        progress.update(task2, description="[green]Bias Scenario Complete![/green]")

    # Print ASCII Dashboard
    console.print("\n")
    table = Table(title="NEXUS Live Intercept Report", show_header=True, header_style="bold magenta")
    table.add_column("Metric", style="dim", width=30)
    table.add_column("Value")
    
    table.add_row("Events Processed", str(num_events))
    table.add_row("Biased Decisions Intercepted", f"[bold red]{intercepted_count}[/bold red]")
    table.add_row("System Bias Status", "[bold green]Mitigated[/bold green]" if intercepted_count > 0 else "[bold yellow]Monitoring[/bold yellow]")
    table.add_row("Avg Gateway Latency", f"{avg_latency:.2f} ms")
    
    console.print(table)
    console.print("\n[bold cyan]Run 'npm run dev' in apps/web to view the full React Dashboard.[/bold cyan]\n")

if __name__ == "__main__":
    asyncio.run(run_demo())
