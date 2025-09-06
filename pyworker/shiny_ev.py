from shiny import App, ui, reactive, render
import pandas as pd
import plotly.express as px

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
        ui.input_file("csv", "Upload a File", accept=[".csv"], multiple=False),
        ui.input_radio_buttons(
            "mode",
            "Plot mode",
            choices={
                "speed_time": "Speed vs Time (gps_speed vs lap_obc_timestamp)",
                "energy_dist": "Energy vs Distance (lap_jm3_netjoule vs dist)",
            },
            selected="speed_time",
        ),
        ui.hr(),
        ui.h4("Axis options"),
        ui.input_checkbox("zero_time", "Zero time to start (t = 0)", value=True),
        ui.input_checkbox("zero_dist", "Zero distance to start (x = 0)", value=True),
        ui.input_checkbox("drop_na", "Drop NA rows", value=True),
        ui.hr(),
        ui.h4("Required columns"),
        ui.tags.ul(
            ui.tags.li(ui.tags.code("gps_speed"), " (km/h)"),
            ui.tags.li(ui.tags.code("lap_obc_timestamp"), " (epoch seconds or numeric)"),
            ui.tags.li(ui.tags.code("lap_jm3_netjoule"), " (Joules)"),
            ui.tags.li(ui.tags.code("dist"), " (meters)"),
        ),
        open="open",
    ),
    ui.layout_column_wrap(
        ui.card(ui.card_header("Preview"), ui.output_ui("preview")),
        ui.card(ui.card_header("Reactive plot"), ui.output_ui("plot")),  # <- plain UI output
        width=1 / 1,
    ),
)

def server(input, output, session):
    @reactive.Calc
    def df() -> pd.DataFrame | None:
        f = input.csv()
        if not f:
            return None
        path = str(f[0]["datapath"])
        d = pd.read_csv(path)
        d.columns = [c.strip().lower() for c in d.columns]
        return d

    @render.ui
    def preview():
        d = df()
        if d is None or d.empty:
            return ui.p("Upload a CSV/JSON to begin.")
        return ui.HTML(d.head(12).to_html(index=False))

    @render.ui
    def plot():
        d = df()
        if d is None or d.empty:
            return ui.HTML("Upload a CSV/JSON to begin.")

        required = ["gps_speed", "lap_obc_timestamp", "lap_jm3_netjoule", "dist"]
        missing = [c for c in required if c not in d.columns]
        if missing:
            return ui.HTML(f"<b>Missing required columns:</b> {', '.join(missing)}")

        if input.mode() == "speed_time":
            x = to_numeric(d["lap_obc_timestamp"])
            if input.zero_time():
                x = zero_to_start(x)
            y = to_numeric(d["gps_speed"])
            xlab = "Time (s from start)" if input.zero_time() else "lap_obc_timestamp"
            ylab = "Vehicle Speed (km/h)"
        else:
            x = to_numeric(d["dist"])
            if input.zero_dist():
                x = zero_to_start(x)
            y = to_numeric(d["lap_jm3_netjoule"])
            xlab = "Distance (m from start)" if input.zero_dist() else "dist"
            ylab = "Energy (J)"

        out = pd.DataFrame({"x": x, "y": y})
        if input.drop_na():
            out = out.dropna(subset=["x", "y"])

        fig = px.line(out, x="x", y="y")
        fig.update_layout(
            margin=dict(l=40, r=20, t=40, b=40),
            xaxis_title=xlab,
            yaxis_title=ylab,
        )

        # Return a self-contained Plotly HTML snippet
        html = fig.to_html(include_plotlyjs="cdn", full_html=False)
        return ui.HTML(html)

app = App(app_ui, server)
