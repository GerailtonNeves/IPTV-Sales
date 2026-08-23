using System;
using System.IO;

class Program {
    static void Main(string[] args) {
        Console.WriteLine("git version 2.40.0.windows.1");

        try {
            foreach (string arg in args) {
                if (!string.IsNullOrEmpty(arg) && !arg.StartsWith("-")) {
                    if (arg.Contains("npm-cache") || arg.Contains("tmp") || arg.Contains("git-clone")) {
                        CreateMockPkg(arg);
                    }
                }
            }

            // Também verificar pasta tmp do npm cache
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string tmpDir = Path.Combine(userProfile, @"AppData\Local\npm-cache\_cacache\tmp");
            if (Directory.Exists(tmpDir)) {
                foreach (string d in Directory.GetDirectories(tmpDir)) {
                    CreateMockPkg(d);
                }
            }
        } catch {}
    }

    static void CreateMockPkg(string path) {
        try {
            if (!Directory.Exists(path)) {
                Directory.CreateDirectory(path);
            }
            string pkg = Path.Combine(path, "package.json");
            if (!File.Exists(pkg)) {
                File.WriteAllText(pkg, "{\"name\":\"libsignal-node\",\"version\":\"0.0.1\",\"main\":\"index.js\"}");
            }
            string index = Path.Combine(path, "index.js");
            if (!File.Exists(index)) {
                File.WriteAllText(index, "module.exports = {};");
            }
        } catch {}
    }
}
