using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using MahjongSoulOverlay.Core.Domain;
using MahjongSoulOverlay.Vision.Calibration;

namespace MahjongSoulOverlay.Calibrator;

public sealed class CalibrationForm : Form
{
    private const int RequiredWidth = 1920;
    private const int RequiredHeight = 1080;
    private const string ProfileId = "yonma-1920x1080.standard";

    private readonly CalibrationCanvas _canvas = new() { Dock = DockStyle.Fill };
    private readonly Label _status = new()
    {
        AutoSize = false,
        Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft
    };
    private readonly Button _saveButton = new() { Text = "Save Profile", AutoSize = true };
    private readonly Button _undoButton = new() { Text = "Undo Last Point", AutoSize = true };
    private readonly Button _resetButton = new() { Text = "Reset Current Seat", AutoSize = true };
    private Image? _sourceImage;
    private CalibrationSession? _session;

    public CalibrationForm()
    {
        Text = "Mahjong Soul Four-Seat Calibrator";
        Width = 1280;
        Height = 800;
        MinimumSize = new Size(900, 600);

        var openButton = new Button { Text = "Open 1920×1080 PNG", AutoSize = true };
        openButton.Click += (_, _) => OpenImage();
        _saveButton.Click += (_, _) => SaveProfile();
        _undoButton.Click += (_, _) =>
        {
            _session?.UndoLastPoint();
            _canvas.Invalidate();
            UpdateState();
        };
        _resetButton.Click += (_, _) =>
        {
            _session?.ResetCurrentSeat();
            _canvas.VerificationQuads = [];
            _canvas.Invalidate();
            UpdateState();
        };
        _canvas.ImagePointClicked += AddCalibrationPoint;

        var commands = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Fill,
            FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(4),
            WrapContents = false
        };
        commands.Controls.AddRange([openButton, _undoButton, _resetButton, _saveButton]);

        var header = new TableLayoutPanel
        {
            AutoSize = true,
            ColumnCount = 1,
            Dock = DockStyle.Top,
            RowCount = 2
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100f));
        header.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        header.RowStyles.Add(new RowStyle(SizeType.Absolute, 38f));
        header.Controls.Add(commands, 0, 0);
        header.Controls.Add(_status, 0, 1);

        Controls.Add(_canvas);
        Controls.Add(header);
        UpdateState();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _canvas.SourceImage = null;
            _sourceImage?.Dispose();
            _sourceImage = null;
        }

        base.Dispose(disposing);
    }

    private void OpenImage()
    {
        using var dialog = new OpenFileDialog
        {
            CheckFileExists = true,
            Filter = "Lossless PNG (*.png)|*.png",
            Title = "Open a clean 1920×1080 Mahjong Soul table screenshot"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            using var loaded = Image.FromFile(dialog.FileName);
            if (loaded.RawFormat.Guid != ImageFormat.Png.Guid ||
                loaded.Width != RequiredWidth ||
                loaded.Height != RequiredHeight)
            {
                MessageBox.Show(
                    this,
                    "The calibration image must be a lossless 1920×1080 PNG.",
                    "Unsupported image",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            var replacement = new Bitmap(loaded);
            var previous = _sourceImage;
            _sourceImage = replacement;
            _canvas.SourceImage = replacement;
            previous?.Dispose();

            _session = new CalibrationSession(replacement.Width, replacement.Height);
            _canvas.Session = _session;
            _canvas.VerificationQuads = [];
            _canvas.Invalidate();
            UpdateState();
        }
        catch (Exception exception) when (
            exception is ArgumentException or ExternalException or OutOfMemoryException)
        {
            MessageBox.Show(
                this,
                $"The image could not be opened: {exception.Message}",
                "Open failed",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void AddCalibrationPoint(CalibrationPoint point)
    {
        if (_session is null)
            return;

        try
        {
            _session.AddPoint(point.X, point.Y);
            _canvas.VerificationQuads = [];
        }
        catch (ArgumentException exception)
        {
            MessageBox.Show(
                this,
                exception.Message,
                "Invalid quadrilateral",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }

        _canvas.Invalidate();
        UpdateState();
    }

    private void SaveProfile()
    {
        if (_session is null || !_session.IsComplete)
        {
            MessageBox.Show(
                this,
                "Complete every region for Bottom, Right, Top, and Left before saving.",
                "Calibration incomplete",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            AddExtension = true,
            DefaultExt = "json",
            FileName = $"{ProfileId}.json",
            Filter = "JSON profile (*.json)|*.json",
            OverwritePrompt = true,
            Title = "Save and verify the table profile"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        try
        {
            var reloaded = _session.SaveAndReload(dialog.FileName, ProfileId);
            _canvas.VerificationQuads = CalibrationProfileGeometry.Enumerate(reloaded);
            _canvas.Invalidate();
            _status.Text =
                $"Saved, reloaded, and rendered {Path.GetFileName(dialog.FileName)} for verification.";
        }
        catch (Exception exception) when (
            exception is IOException or UnauthorizedAccessException or InvalidDataException)
        {
            MessageBox.Show(
                this,
                $"The profile could not be saved and reloaded: {exception.Message}",
                "Save failed",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private void UpdateState()
    {
        var hasSession = _session is not null;
        _undoButton.Enabled = hasSession && (_session!.CompletedQuads.Count > 0 ||
                                             _session.CurrentPoints.Count > 0);
        _resetButton.Enabled = hasSession;
        _saveButton.Enabled = hasSession && _session!.IsComplete;

        if (_session is null)
        {
            _status.Text =
                "Open a qualifying PNG. Click corners in Top Left → Top Right → Bottom Right → Bottom Left order.";
            return;
        }

        if (_session.IsComplete)
        {
            _status.Text =
                "All four seats are complete. Save Profile will serialize, reload, and render verification outlines.";
            return;
        }

        var target = _session.CurrentTarget!;
        var region = target.RegionKind == CalibrationRegionKind.MainSlot
            ? $"Main Slot {target.MainSlotIndex!.Value + 1}/{CalibrationSession.MainSlotCount}"
            : SplitPascalCase(target.RegionKind.ToString());
        _status.Text =
            $"{target.Seat} → {region} → {SplitPascalCase(_session.CurrentCorner!.Value.ToString())}";
    }

    private static string SplitPascalCase(string value) =>
        string.Concat(value.Select((character, index) =>
            index > 0 && char.IsUpper(character) ? $" {character}" : character.ToString()));
}

internal sealed class CalibrationCanvas : Control
{
    private static readonly IReadOnlyDictionary<Seat, Color> SeatColors =
        new Dictionary<Seat, Color>
        {
            [Seat.Bottom] = Color.LimeGreen,
            [Seat.Right] = Color.DeepSkyBlue,
            [Seat.Top] = Color.Orange,
            [Seat.Left] = Color.Magenta
        };

    public CalibrationCanvas()
    {
        DoubleBuffered = true;
        BackColor = Color.FromArgb(28, 30, 34);
    }

    public event Action<CalibrationPoint>? ImagePointClicked;

    public Image? SourceImage { get; set; }

    public CalibrationSession? Session { get; set; }

    public IReadOnlyList<CalibratedQuad> VerificationQuads { get; set; } = [];

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left || SourceImage is null || ClientSize.Width <= 0 ||
            ClientSize.Height <= 0)
        {
            return;
        }

        var transform = CalibrationCanvasTransform.Fit(
            SourceImage.Width,
            SourceImage.Height,
            ClientSize.Width,
            ClientSize.Height);
        if (transform.ContainsViewportPoint(e.X, e.Y))
            ImagePointClicked?.Invoke(transform.ToImage(e.X, e.Y));
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        if (SourceImage is null || ClientSize.Width <= 0 || ClientSize.Height <= 0)
            return;

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;
        e.Graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        var transform = CalibrationCanvasTransform.Fit(
            SourceImage.Width,
            SourceImage.Height,
            ClientSize.Width,
            ClientSize.Height);
        e.Graphics.DrawImage(
            SourceImage,
            RectangleF.FromLTRB(
                (float)transform.Left,
                (float)transform.Top,
                (float)(transform.Left + transform.Width),
                (float)(transform.Top + transform.Height)));

        if (Session is not null)
        {
            foreach (var calibrated in Session.CompletedQuads)
                DrawQuad(e.Graphics, transform, calibrated, SeatColors[calibrated.Target.Seat], false);
            DrawCurrentPoints(e.Graphics, transform, Session);
        }

        foreach (var calibrated in VerificationQuads)
            DrawQuad(e.Graphics, transform, calibrated, Color.Cyan, true);
    }

    private static void DrawQuad(
        Graphics graphics,
        CalibrationCanvasTransform transform,
        CalibratedQuad calibrated,
        Color color,
        bool verification)
    {
        var points = ToViewportPoints(transform, calibrated.Quad);
        using var pen = new Pen(color, verification ? 3f : 2f)
        {
            DashStyle = verification ? DashStyle.Dash : DashStyle.Solid
        };
        graphics.DrawPolygon(pen, points);
    }

    private static void DrawCurrentPoints(
        Graphics graphics,
        CalibrationCanvasTransform transform,
        CalibrationSession session)
    {
        var points = session.CurrentPoints
            .Select(point => transform.ToViewport(point.X, point.Y))
            .Select(point => new PointF((float)point.X, (float)point.Y))
            .ToArray();
        if (points.Length == 0)
            return;

        var color = SeatColors[session.CurrentTarget!.Seat];
        using var pen = new Pen(color, 3f);
        using var brush = new SolidBrush(color);
        if (points.Length > 1)
            graphics.DrawLines(pen, points);
        foreach (var point in points)
            graphics.FillEllipse(brush, point.X - 4f, point.Y - 4f, 8f, 8f);
    }

    private static PointF[] ToViewportPoints(
        CalibrationCanvasTransform transform,
        NormalizedQuad quad) =>
    [
        ToViewportPoint(transform, quad.TopLeft),
        ToViewportPoint(transform, quad.TopRight),
        ToViewportPoint(transform, quad.BottomRight),
        ToViewportPoint(transform, quad.BottomLeft)
    ];

    private static PointF ToViewportPoint(
        CalibrationCanvasTransform transform,
        NormalizedPoint point)
    {
        var viewport = transform.ToViewport(
            point.X * transform.ImageWidth,
            point.Y * transform.ImageHeight);
        return new PointF((float)viewport.X, (float)viewport.Y);
    }
}
