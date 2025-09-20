from shiny import App, ui, reactive, render
import pandas as pd
import plotly.express as px
import numpy as np

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
        ui.hr(),
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
        open="open",
    ),
    ui.layout_column_wrap(
        ui.card(ui.card_header("Preview"), ui.output_ui("preview")),
        ui.output_ui("plot_card"),  
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

        # Show first 20 rows, all columns
        styled_html = (
            d.head(20)
            .to_html(
                index=False,
                border=1,
                justify="center",
                classes="table table-striped table-bordered table-sm"
            )
        )

    # Wrap in a scrollable div so wide tables don’t break layout
        return ui.HTML(
            f"""
            <div style="max-height:400px; overflow:auto; white-space:nowrap;">
                {styled_html}
            </div>
            """
        )
    def numeric_like_columns(_df: pd.DataFrame) -> list[str]:
        cols: list[str] = []
        for c in _df.columns:
            s = _df[c]
            if pd.api.types.is_numeric_dtype(s):
                sn = s
            else:
                sn = pd.to_numeric(s, errors="coerce")

            # Drop NA to assess content
            sn_non_na = sn.dropna()
            if sn_non_na.empty:
                continue

            # Skip columns that are all zeros (within tolerance)
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
            return ui.HTML("Upload a CSV/JSON to begin.")

        # Determine defaults
        def pick_defaults(cols: list[str]) -> tuple[str | None, list[str]]:
            if not cols:
                return None, []
            pref_x = ["lap_obc_timestamp", "timestamp", "time", "dist", "distance"]
            x_def = next((c for c in pref_x if c in cols), cols[0])
            pref_y = ["gps_speed", "speed", "lap_jm3_netjoule", "power", "energy"]
            y_defs = [c for c in pref_y if c in cols and c != x_def]
            if not y_defs:
                rem = [c for c in cols if c != x_def]
                y_defs = rem[:1] if rem else []
            return x_def, y_defs

        num_cols = numeric_like_columns(d)
        try:
            xcol = input.xcol()
        except Exception:
            xcol = None
        try:
            ycols = input.ycols() or []
        except Exception:
            ycols = []

        def_x, def_ycols = pick_defaults(num_cols)
        xcol = xcol if xcol in d.columns else def_x
        if not ycols:
            ycols = def_ycols

        if xcol is None or not ycols:
            return ui.HTML("No suitable numeric columns to plot.")

        # Prepare X
        x = to_numeric(d[xcol])
        if any(k in xcol.lower() for k in ["time", "timestamp", "dist", "distance"]):
            x = zero_to_start(x)

        out = pd.DataFrame({"x": x})
        for yc in ycols:
            out[yc] = to_numeric(d[yc])

        # Reshape to long format for Plotly
        out_long = out.melt(id_vars=["x"], value_vars=ycols,
                            var_name="Series", value_name="y").dropna()

        # Plot
        plot_type = input.plot_type()
        if plot_type == "scatter":
            fig = px.scatter(out_long, x="x", y="y", color="Series")
        else:
            fig = px.line(out_long, x="x", y="y", color="Series")

        xmin, xmax = input.xmin(), input.xmax()
        ymin, ymax = input.ymin(), input.ymax()

        fig.update_layout(
            legend_title_text="", 
            margin=dict(l=40, r=20, t=40, b=40),
            xaxis_title=xcol,
            yaxis_title="Values",
            xaxis=dict(range=[xmin, xmax] if xmin is not None and xmax is not None else None),
            yaxis=dict(range=[ymin, ymax] if ymin is not None and ymax is not None else None),
        )

        return ui.HTML(fig.to_html(include_plotlyjs="cdn", full_html=False))


app = App(app_ui, server)
