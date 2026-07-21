package com.foliomobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.io.InputStream;

import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;

public class FilePickerModule extends ReactContextBaseJavaModule {

  private static final int PICK_PDF_REQ = 1001;
  private static final int PICK_CSV_REQ = 1002;
  private Promise pickPromise;

  private final ActivityEventListener activityListener = new BaseActivityEventListener() {
    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
      if (pickPromise == null) return;
      if (resultCode != Activity.RESULT_OK || data == null) {
        pickPromise.resolve(Arguments.createArray());
        pickPromise = null;
        return;
      }
      WritableArray results = Arguments.createArray();
      Uri uri = data.getData();
      if (uri != null) {
        results.pushString(uri.toString());
      }
      ClipData clipData = data.getClipData();
      if (clipData != null) {
        for (int i = 0; i < clipData.getItemCount(); i++) {
          Uri u = clipData.getItemAt(i).getUri();
          if (u != null) results.pushString(u.toString());
        }
      }
      pickPromise.resolve(results);
      pickPromise = null;
    }
  };

  FilePickerModule(ReactApplicationContext context) {
    super(context);
    context.addActivityEventListener(activityListener);
  }

  @Override
  public String getName() {
    return "FolioFilePicker";
  }

  @ReactMethod
  public void pickPdf(Promise promise) {
    pickPromise = promise;
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/pdf");
    getCurrentActivity().startActivityForResult(intent, PICK_PDF_REQ);
  }

  @ReactMethod
  public void pickCsv(boolean multiple, Promise promise) {
    pickPromise = promise;
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("text/*");
    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
    getCurrentActivity().startActivityForResult(intent, PICK_CSV_REQ);
  }

  @ReactMethod
  public void readFileAsBase64(String uri, Promise promise) {
    try {
      Uri u = Uri.parse(uri);
      InputStream is = getReactApplicationContext().getContentResolver().openInputStream(u);
      byte[] bytes = new byte[is.available()];
      is.read(bytes);
      is.close();
      String b64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP);
      promise.resolve(b64);
    } catch (Exception e) {
      promise.reject("READ_ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void readFileAsText(String uri, Promise promise) {
    try {
      Uri u = Uri.parse(uri);
      InputStream is = getReactApplicationContext().getContentResolver().openInputStream(u);
      java.util.Scanner s = new java.util.Scanner(is).useDelimiter("\\A");
      String text = s.hasNext() ? s.next() : "";
      is.close();
      promise.resolve(text);
    } catch (Exception e) {
      promise.reject("READ_ERROR", e.getMessage());
    }
  }

  @ReactMethod
  public void readPdfAsText(String uri, String password, Promise promise) {
    try {
      Uri u = Uri.parse(uri);
      InputStream is = getReactApplicationContext().getContentResolver().openInputStream(u);
      PDDocument doc;
      if (password != null && !password.isEmpty()) {
        doc = PDDocument.load(is, password);
      } else {
        doc = PDDocument.load(is);
      }
      PDFTextStripper stripper = new PDFTextStripper();
      String text = stripper.getText(doc);
      doc.close();
      is.close();
      promise.resolve(text);
    } catch (Exception e) {
      promise.reject("PDF_ERROR", e.getMessage());
    }
  }
}
