using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Project Hail Rocky")]
[assembly: AssemblyProduct("PHR")]
[assembly: AssemblyVersion("1.0.0.0")]

static class Program
{
    static string AppDir      = Path.GetDirectoryName(Application.ExecutablePath);
    static string ElectronExe = Path.Combine(AppDir, @"app\Rocky.exe");
    static NotifyIcon trayIcon;
    static Process rockyProc;

    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        bool minimized = Array.Exists(args, a => a == "--minimized");

        SetupTray();

        if (!File.Exists(ElectronExe))
        {
            MessageBox.Show(
                "Rocky app not found.\nExpected: " + ElectronExe +
                "\n\nPlease reinstall Project Hail Rocky.",
                "PHR", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        if (minimized)
        {
            TrayTip("Project Hail Rocky is running", "Double-click the tray icon to open.");
        }
        else
        {
            LaunchRocky();
        }

        Application.Run();
    }

    static void LaunchRocky(string extraArgs = "")
    {
        if (rockyProc != null && !rockyProc.HasExited)
        {
            // Already running - just bring it to front via the tray icon signal
            return;
        }
        try
        {
            rockyProc = Process.Start(ElectronExe, extraArgs);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Could not launch Rocky:\n" + ex.Message, "PHR",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void SetupTray()
    {
        trayIcon = new NotifyIcon { Text = "Project Hail Rocky", Visible = true };

        string iconPath = Path.Combine(AppDir, @"app\resources\app.ico");
        trayIcon.Icon = File.Exists(iconPath) ? new Icon(iconPath) : SystemIcons.Application;

        trayIcon.ContextMenu = new ContextMenu(new[] {
            new MenuItem("Open PHR",  (s, e) => LaunchRocky()),
            new MenuItem("-"),
            new MenuItem("Quit",      (s, e) => Quit()),
        });
        trayIcon.DoubleClick += (s, e) => LaunchRocky();
    }

    static void TrayTip(string title, string text)
    {
        trayIcon.BalloonTipTitle = title;
        trayIcon.BalloonTipText  = text;
        trayIcon.ShowBalloonTip(3000);
    }

    static void Quit()
    {
        trayIcon.Visible = false;
        Application.Exit();
    }
}
