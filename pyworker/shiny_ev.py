from shiny import App, ui, reactive, render
import pandas as pd
import plotly.express as px
import numpy as np
from math import isinf
import os
import requests 
from urllib.parse import urlparse, parse_qs
import shinyswatch

API_BASE = os.getenv("API_BASE", "http://server:5000")

def fetch_csv_from_backend(csv_name: str) -> pd.DataFrame | None:
    try:
        url = f"{API_BASE}/api/csv/{csv_name}"
        print(f"[INFO] Fetching CSV from {url}")
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        js = resp.json()
        headers, rows = js.get("headers", []), js.get("data", [])
        if not headers or not rows:
            print("[WARN] Empty CSV data received")
            return None
        df = pd.DataFrame(rows)
        print(f"[INFO] Loaded CSV with {len(df)} rows, {len(df.columns)} cols")
        return df
    except Exception as e:
        print(f"[ERROR] Failed to fetch CSV: {e}")
        return None

POSTMESSAGE_JS = """
console.log("[SHINY] PostMessage listener initializing...");

window.addEventListener("message", (event) => {
  console.log("[SHINY] Message received:", event.data, "from origin:", event.origin);
  
  const msg = event.data;
  if (msg && typeof msg === "object" && (msg.type === "load_csv" || msg.type === "load_rosbag")) {
    console.log("[SHINY] Valid message detected:", msg);

    function trySend() {
      if (window.Shiny && Shiny.setInputValue) {
        Shiny.setInputValue("msg", msg, { priority: "event" });
        console.log(`[SHINY] Message delivered to Shiny input 'msg' (${msg.type})`);
      } else {
        console.log("[SHINY] Shiny not ready yet; retrying in 100ms...");
        setTimeout(trySend, 100);
      }
    }

    trySend();
  }
});

console.log("[SHINY] PostMessage listener installed");
"""

CLICK_JS = """
(function () {
  let buffer = [];

  function pushPoint(pt) {
    buffer.push(pt);
    if (buffer.length > 2) buffer = buffer.slice(-2);
    if (window.Shiny && Shiny.setInputValue) {
      Shiny.setInputValue("selected_points", buffer, { priority: "event" });
    }
  }

  function bind(graph) {
    if (!graph || typeof graph.on !== "function") return;
    if (graph.__clickBound) return;
    graph.__clickBound = true;

    graph.on("plotly_click", (ev) => {
      if (!ev || !ev.points || !ev.points.length) return;
      const p = ev.points[0];
      console.log("Clicked point:", p);
      pushPoint({ x: p.x, y: p.y, index: p.pointIndex });
    });
  }

  function tryBind() {
    const host = document.getElementById("plot_container");
    if (!host) return;
    const graph = host.querySelector(".plotly-graph-div, .js-plotly-plot");
    if (graph) bind(graph);
  }

  try {
    const mo = new MutationObserver(tryBind);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  window.addEventListener("DOMContentLoaded", tryBind);
  document.addEventListener("shiny:connected", tryBind);

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    tryBind();
    if (tries > 20) clearInterval(t);
  }, 50);

  if (window.Shiny && Shiny.addCustomMessageHandler) {
    Shiny.addCustomMessageHandler("clear-plot-selection", function (message) {
      buffer = [];
      Shiny.setInputValue("selected_points", buffer, { priority: "event" });
    });
  }
})();
"""

app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.h2("Run Analysis"),
        ui.h4("Plot options"),
        ui.input_select("plot_type", "Plot type", choices=["line", "scatter"], selected="line"),
        ui.hr(),
        ui.h4("Select axes"),
        ui.output_ui("x_select"),
        ui.output_ui("y_select"),
        ui.hr(),
        ui.h4("Axis ranges"),
        ui.input_numeric("xmin", "X min", value=None),
        ui.input_numeric("xmax", "X max", value=None),
        ui.input_numeric("ymin", "Y min", value=None),
        ui.input_numeric("ymax", "Y max", value=None),
        ui.hr(),
        ui.h4("Pick Two Points"),
        ui.input_action_button("reset_sel", "Reset selection"),
        ui.output_text("sel_points"),
        open="open",
    ),
    ui.tags.head(
            ui.tags.script({"defer": True, "src": "https://cdn.plot.ly/plotly-2.29.1.min.js"}),
            ui.tags.script(ui.HTML(POSTMESSAGE_JS)),
            ui.tags.script(ui.HTML(CLICK_JS)),
        ),
    
    ui.tags.div(
        ui.card(ui.card_header("Preview"), ui.output_ui("preview"), style="height: auto !important;"),
        ui.card(
        ui.card_header("Reactive plot"),
        ui.output_ui("plot_title_ui"), 
        ui.output_ui("plot"),
        style="height: auto !important;"
            ),
        ui.card(
            ui.card_header("Results"),
            ui.output_text("delta_x"),
            ui.output_text("delta_y"),
            ui.output_text("slope"),
            style="height: auto !important;"
        ),
        style="display: grid; grid-template-columns: 1fr; gap: 1rem; align-items: start;"
    ),
    theme=shinyswatch.theme.darkly,
)

from urllib.parse import quote

def server(input, output, session):
    csv_name = reactive.Value(None)
    bag_name = reactive.Value(None)
    topic_name = reactive.Value(None)

    @reactive.effect
    @reactive.event(input.msg)
    def _handle_post_message():
        msg = input.msg()
        print(f"[SERVER] Received msg input: {msg}")
        if not msg:
            return

        if isinstance(msg, dict):
            msg_type = msg.get("type")
            if msg_type == "load_csv":
                chosen = msg.get("csv")
                if chosen:
                    csv_name.set(chosen)
                    bag_name.set(None)
                    topic_name.set(None)
                    print(f"[INFO] CSV set via postMessage: {chosen}")

            elif msg_type == "load_rosbag":
                b = msg.get("bag")
                t = msg.get("topic")
                if b and t:
                    bag_name.set(b)
                    topic_name.set(t)
                    csv_name.set(None)
                    print(f"[INFO] ROSBag set via postMessage: bag={b}, topic={t}")

    @reactive.Calc
    def df() -> pd.DataFrame | None:
        """Fetch data based on whether a CSV or ROSBag is selected."""
        if csv_name.get():
            name = csv_name.get()
            print(f"[DEBUG] df(): fetching CSV {name}")
            d = fetch_csv_from_backend(name)
            if d is None or d.empty:
                print(f"[WARN] No data for {name}")
                return None
            d.columns = [c.strip().lower() for c in d.columns]
            return d

        if bag_name.get() and topic_name.get():
            try:
                url = f"{API_BASE}/api/rosbags/{bag_name.get()}?topic={quote(topic_name.get())}"
                print(f"[INFO] Fetching ROSBag data from {url}")
                resp = requests.get(url, timeout=15)
                resp.raise_for_status()

                js = resp.json()
                if isinstance(js, dict) and "messages" in js:
                    data = js.get("messages", [])
                else:
                    data = js

                print(
                    f"[DEBUG] ROSBag API returned type={type(data)}, len={len(data) if isinstance(data, list) else 'N/A'}"
                )
                if isinstance(data, list) and len(data) > 0:
                    print(f"[DEBUG] First item sample: {data[0]}")

                if not isinstance(data, list) or not data:
                    print("[WARN] Unexpected or empty ROSBag response format")
                    return None
                
                df = pd.json_normalize(data, sep='_')

                df.columns = [c.replace("data_", "") for c in df.columns]
                df.columns = [c.strip().lower() for c in df.columns]

                if 'timestamp' in df.columns:
                    df['timestamp'] = pd.to_numeric(df['timestamp'], errors='coerce')
                    first_timestamp = df['timestamp'].min()
                    df['normalized_time'] = (df['timestamp'] - first_timestamp) / 1e9

                print(f"[INFO] Loaded ROSBag '{bag_name.get()}' with {len(df)} rows and {len(df.columns)} columns")
                print(f"[DEBUG] Columns: {list(df.columns)[:10]}...")

                return df

            except Exception as e:
                print(f"[ERROR] Failed to fetch ROSBag data: {e}")
                return None

        return None

    @render.ui
    def preview():
        d = df()
        if d is None or d.empty:
            return ui.p("Waiting for data...")
        styled_html = d.head(20).to_html(
            index=False, border=1, justify="center",
            classes="table table-striped table-bordered table-sm"
        )
        return ui.HTML(f"<div style='max-height:400px;overflow:auto'>{styled_html}</div>")

    selected_points = reactive.Value([])

    @reactive.effect
    @reactive.event(input.selected_points)
    def _on_points_from_client():
        pts = input.selected_points() or []
        print("[SERVER] input.selected_points:", pts)
        selected_points.set(pts[-2:])

    @reactive.effect
    @reactive.event(input.reset_sel)
    def _reset_sel():
        selected_points.set([])
        session.send_custom_message("clear-plot-selection", {})

    @reactive.calc
    def dx():
        pts = selected_points.get()
        return (pts[1]["x"] - pts[0]["x"]) if len(pts) == 2 else None

    @reactive.calc
    def dy():
        pts = selected_points.get()
        return (pts[1]["y"] - pts[0]["y"]) if len(pts) == 2 else None

    @render.text
    def sel_points():
        pts = selected_points.get()
        if not pts:
            return "No points selected. Click two points on the plot."
        if len(pts) == 1:
            p = pts[0]
            return f"Point 1: (x={p['x']}, y={p['y']}) — click a second point."
        p1, p2 = pts
        return f"Point 1: (x={p1['x']}, y={p1['y']}), Point 2: (x={p2['x']}, y={p2['y']})"

    @render.text
    def delta_x():
        v = dx()
        return "Δx = —" if v is None else f"Δx = {v:.6g}"

    @render.text
    def delta_y():
        v = dy()
        return "Δy = —" if v is None else f"Δy = {v:.6g}"

    @render.text
    def slope():
        dvx, dvy = dx(), dy()
        if dvx is None or dvy is None:
            return "Slope m = —"
        if dvx == 0:
            return "Slope m = undefined (vertical line)"
        return f"Slope m = {dvy/dvx:.6g}"

    @render.ui
    def x_select():
        d = df()
        if d is None or d.empty:
            return ui.input_select("xcol", "X Axis", choices=[])
        num_cols = [c for c in d.columns if pd.api.types.is_numeric_dtype(pd.to_numeric(d[c], errors="coerce"))]
        return ui.input_select("xcol", "X Axis", choices=num_cols)

    @render.ui
    def y_select():
        d = df()
        if d is None or d.empty:
            return ui.input_selectize("ycols", "Y Axis", choices=[], multiple=True)
        num_cols = [c for c in d.columns if pd.api.types.is_numeric_dtype(pd.to_numeric(d[c], errors="coerce"))]
        return ui.input_selectize("ycols", "Y Axis", choices=num_cols, multiple=True)

    @render.ui
    def plot_title_ui():
        d = df()
        if d is None or d.empty:
            return None  # Don't show title input until CSV is loaded
        return ui.div(
            ui.input_text("plot_title", None, placeholder="Enter a graph title..."),
            style="text-align:center; margin-bottom:10px;"
        )


    @render.ui
    def plot():
        d = df()
        if d is None or d.empty:
            return ui.HTML("Waiting for data...")

        numeric_cols = [c for c in d.columns
                        if pd.api.types.is_numeric_dtype(pd.to_numeric(d[c], errors="coerce"))]
        if not numeric_cols:
            return ui.HTML("No numeric columns found.")

        xcol = input.xcol() or next((c for c in numeric_cols if "time" in c.lower()), numeric_cols[0])
        ycols = input.ycols() or [c for c in numeric_cols if c != xcol] or numeric_cols[1:]

        print(f"[INFO] Plotting X={xcol}, Y={ycols}")
        x = pd.to_numeric(d[xcol], errors="coerce")
        out = pd.DataFrame({"x": x})
        for yc in ycols:
            out[yc] = pd.to_numeric(d[yc], errors="coerce")

        out_long = out.melt(id_vars=["x"], var_name="Series", value_name="y").dropna()
        plot_type = input.plot_type() or "line"
        fig = px.line(out_long, x="x", y="y", color="Series") if plot_type == "line" \
            else px.scatter(out_long, x="x", y="y", color="Series")
        
        # Apply axis ranges from user inputs
        xmin = input.xmin()
        xmax = input.xmax()
        ymin = input.ymin()
        ymax = input.ymax()
        
        fig.update_layout(
            title={
                "text": input.plot_title() or "",
                "x": 0.45,
                "xanchor": "center",
                "yanchor": "top"
            },
            title_font=dict(size=20, family="Arial", color="black"),
            legend_title_text="",
            margin=dict(l=40, r=20, t=80, b=40),
            xaxis_title=xcol,
            yaxis_title="Values",
            xaxis=dict(
                range=[xmin, xmax] if xmin is not None and xmax is not None else None
            ),
            yaxis=dict(
                range=[ymin, ymax] if ymin is not None and ymax is not None else None
            )
        )
        fig.update_layout(modebar_add=["toImage"])

        html = fig.to_html(include_plotlyjs=False, full_html=False)
        return ui.HTML(f"<div id='plot_container'>{html}</div>")

app = App(app_ui, server)
