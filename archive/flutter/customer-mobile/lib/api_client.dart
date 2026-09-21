import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const apiUrl = String.fromEnvironment('AFHOMES_API_URL',
    defaultValue: 'https://afhomes-sales-api-afhomes.vercel.app');

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({FlutterSecureStorage? storage})
      : storage = storage ?? const FlutterSecureStorage();
  final FlutterSecureStorage storage;
  String? accessToken;
  Future<bool> restore() async {
    accessToken = await storage.read(key: 'access_token');
    return accessToken != null;
  }

  Future<Map<String, dynamic>> register(
          String email, String name, String password) =>
      request('/api/v1/auth/register',
          method: 'POST',
          body: {
            'email': email,
            'display_name': name,
            'password': password,
            'device_name': 'AFhomes Customer App'
          },
          authenticated: false);
  Future<void> verify(String email, String code) async {
    final data = await request('/api/v1/auth/verify-email',
        method: 'POST',
        body: {
          'email': email,
          'code': code,
          'device_name': 'AFhomes Customer App'
        },
        authenticated: false);
    await _saveTokens(data);
  }

  Future<void> login(String email, String password) async {
    final data = await request('/api/v1/auth/login',
        method: 'POST',
        body: {'email': email, 'password': password},
        authenticated: false);
    await _saveTokens(data);
  }

  Future<void> logout() async {
    final refresh = await storage.read(key: 'refresh_token');
    if (refresh != null) {
      try {
        await request('/api/v1/auth/logout',
            method: 'POST',
            body: {'refresh_token': refresh},
            authenticated: false);
      } catch (_) {}
    }
    await storage.deleteAll();
    accessToken = null;
  }

  Future<Map<String, dynamic>> request(String path,
      {String method = 'GET',
      Map<String, dynamic>? body,
      bool authenticated = true}) async {
    var response =
        await _send(path, method, body, authenticated ? accessToken : null);
    if (response.statusCode == 401 && authenticated && await _refresh()) {
      response = await _send(path, method, body, accessToken);
    }
    final decoded =
        response.body.isEmpty ? <String, dynamic>{} : jsonDecode(response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException(decoded is Map<String, dynamic>
          ? decoded['message']?.toString() ?? 'Request failed'
          : 'Request failed');
    }
    return decoded is Map<String, dynamic>
        ? decoded
        : <String, dynamic>{'items': decoded};
  }

  Future<http.Response> _send(
      String path, String method, Map<String, dynamic>? body, String? token) {
    final headers = {
      'content-type': 'application/json',
      if (token != null) 'authorization': 'Bearer $token'
    };
    final uri = Uri.parse('$apiUrl$path');
    return switch (method) {
      'POST' => http.post(uri, headers: headers, body: jsonEncode(body ?? {})),
      'PATCH' =>
        http.patch(uri, headers: headers, body: jsonEncode(body ?? {})),
      _ => http.get(uri, headers: headers)
    };
  }

  Future<bool> _refresh() async {
    final refresh = await storage.read(key: 'refresh_token');
    if (refresh == null) return false;
    try {
      final response = await _send(
          '/api/v1/auth/refresh',
          'POST',
          {'refresh_token': refresh, 'device_name': 'AFhomes Customer App'},
          null);
      if (response.statusCode != 200) return false;
      await _saveTokens(jsonDecode(response.body));
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _saveTokens(Map<String, dynamic> data) async {
    accessToken = data['access_token'] as String?;
    if (accessToken == null) {
      throw ApiException('Authentication response was incomplete');
    }
    await storage.write(key: 'access_token', value: accessToken);
    await storage.write(
        key: 'refresh_token', value: data['refresh_token'] as String?);
  }
}
