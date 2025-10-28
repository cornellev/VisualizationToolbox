# shiny_ev.py
from shiny import App, ui, reactive, render
import pandas as pd
import plotly.express as px
import numpy as np
from math import isinf
import requests 
import urllib.parse

API_BASE = "http://server:5000/api" 

CLICK_JS = """
(function () {
  let buffer = []; // keep last two clicked points

  function pushPoint(pt) {
    buffer.push(pt);
    if (buffer.length > 2) buffer = buffer.slice(-2);
    if (window.Shiny && Shiny.setInputValue) {
      Shiny.setInputValue("selected_points", buffer, { priority: "event" });
    }
  }

  function bind(graph) {
    if (!graph || typeof graph.on !== "function") return;
    if (graph.__clickBound) return;  // avoid double-binding
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

  // Observe DOM changes so we catch (re)renders
  try {
    const mo = new MutationObserver(tryBind);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    // MutationObserver not available; ignore
  }

  // Also try on common lifecycle events
  window.addEventListener("DOMContentLoaded", tryBind);
  document.addEventListener("shiny:connected", tryBind);

  // Small fallback retry loop in case timing is still off
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    tryBind();
    if (tries > 20) clearInterval(t); // ~1s total
  }, 50);

  // Clear selection from server
  if (window.Shiny && Shiny.addCustomMessageHandler) {
    Shiny.addCustomMessageHandler("clear-plot-selection", function () {
      buffer = [];
      Shiny.setInputValue("selected_points", buffer, { priority: "event" });
    });
  }
})();
"""


def to_numeric(s: pd.Series) -> pd.Series:
    if pd.api.types.is_numeric_dtype(s):
        return s
    return pd.to_numeric(s, errors="coerce")

def zero_to_start(s: pd.Series) -> pd.Series:
    if s.empty:
        return s
    idx = s.first_valid_index()
    if idx is None:
        return s
    return s - s.loc[idx]

app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.h2("Run Data Analysis"),
        ui.h4("Plot options"),
        ui.input_select("plot_type", "Plot type", choices = ["line", "scatter"], selected="line"),
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
    ui.layout_column_wrap(
        # Ensure Plotly is loaded before our figure HTML runs
        ui.tags.script({"defer": True, "src": "https://cdn.plot.ly/plotly-2.29.1.min.js"}),
        ui.tags.script(CLICK_JS),
        ui.card(ui.card_header("Preview"), ui.output_ui("preview")),
        ui.card(ui.card_header("Reactive plot"), ui.output_ui("plot")),
        ui.card(
            ui.card_header("Results"),
            ui.output_text("delta_x"),
            ui.output_text("delta_y"),
            ui.output_text("slope"),
        ),
        width=1 / 1,
    ),
)

def server(input, output, session):
    dataframe = reactive.Value(None)

    # Fetch data from Express API at startup
    @reactive.effect
    def _fetch_csv():
        try:
            query = session.request.query_string
            params = urllib.parse.parse_qs(query)
            csv_name = params.get("csv", [None])[0]

            if not csv_name:
                print("[INFO] No ?csv parameter provided in URL.")
                return

            print(f"[INFO] Fetching CSV '{csv_name}' from API...")
            res = requests.get(f"{API_BASE}/csv/{csv_name}", timeout=10)
            res.raise_for_status()
            payload = res.json()

            data = payload.get("data", [])
            if not data:
                print("[WARN] CSV data is empty.")
                return

            df = pd.DataFrame(data)
            df.columns = [c.strip().lower() for c in df.columns]
            dataframe.set(df)
            print(f"[INFO] Loaded CSV '{csv_name}' ({len(df)} rows).")
        except Exception as e:
            print("[ERROR] Failed to fetch CSV:", e)

    @reactive.calc
    def df():
        return dataframe.get()


    @render.ui
    def preview():
        d = df()
        if d is None or d.empty:
            return ui.p("Waiting for CSV data...")
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

    def numeric_like_columns(_df: pd.DataFrame) -> list[str]:
        cols: list[str] = []
        for c in _df.columns:
            s = _df[c]
            if pd.api.types.is_numeric_dtype(s):
                sn = s
            else:
                sn = pd.to_numeric(s, errors="coerce")

            sn_non_na = sn.dropna()
            if sn_non_na.empty:
                continue

            if np.all(np.isclose(sn_non_na.to_numpy(), 0.0, rtol=0.0, atol=0.0)):
                continue

            cols.append(c)
        return cols

    @render.ui
    def plot_card():
        plot_type = input.plot_type()
        title = "Line Plot" if plot_type == "line" else "Scatter Plot"
        return ui.card(
            ui.card_header(title),
            ui.card_body(
                ui.output_ui("plot")
            )
        )

    @render.ui
    def x_select():
        d = df()
        if d is None or d.empty:
            return ui.input_select("xcol", "X Axis", choices=[])
        num_cols = numeric_like_columns(d)
        preferred = ["lap_obc_timestamp", "timestamp", "time", "dist", "distance"]
        default = next((c for c in preferred if c in num_cols), (num_cols[0] if num_cols else None))
        return ui.input_select("xcol", "X Axis", choices=num_cols, selected=default)

    @render.ui
    def y_select():
        d = df()
        if d is None or d.empty:
            return ui.input_selectize("ycols", "Y Axis (multiple)", choices=[], multiple=True)

        num_cols = numeric_like_columns(d)
        preferred = ["gps_speed", "speed", "lap_jm3_netjoule", "power", "energy"]

        # pick all preferred cols that exist, or just the first numeric col
        defaults = [c for c in preferred if c in num_cols]
        if not defaults and num_cols:
            defaults = [num_cols[0]]

        return ui.input_selectize(
            "ycols",
            "Y Axis (multiple)",
            choices=num_cols,
            selected=defaults,
            multiple=True
        )

    @render.ui
    def plot():
        d = df()
        if d is None or d.empty:
            return ui.HTML("Waiting for CSV data...")

        num_cols = numeric_like_columns(d)
        if not num_cols:
            return ui.HTML("No numeric columns found in CSV.")
        xcol = input.xcol() or num_cols[0]
        ycols = input.ycols() or num_cols[1:2]

        x = to_numeric(d[xcol])
        if any(k in xcol.lower() for k in ["time", "timestamp", "dist", "distance"]):
            x = zero_to_start(x)

        out = pd.DataFrame({"x": x})
        for yc in ycols:
            out[yc] = to_numeric(d[yc])

        out_long = out.melt(id_vars=["x"], value_vars=ycols,
                            var_name="Series", value_name="y").dropna()

        fig = px.line(out_long, x="x", y="y", color="Series") \
            if input.plot_type() == "line" \
            else px.scatter(out_long, x="x", y="y", color="Series")

        fig.update_layout(
            legend_title_text="",
            margin=dict(l=40, r=20, t=40, b=40),
            xaxis_title=xcol,
            yaxis_title="Values"
        )

        html = fig.to_html(include_plotlyjs=False, full_html=False)
        return ui.HTML(f"<div id='plot_container'>{html}</div>")
app = App(app_ui, server)