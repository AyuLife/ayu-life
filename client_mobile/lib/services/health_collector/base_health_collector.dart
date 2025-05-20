abstract class BaseHealthCollector {
  final instance;
  Future<bool> requestPermissions();
  void init();
}
