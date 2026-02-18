import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '../../../components/Button';
import { apiCallJSON } from '../../../utils/api';
import logger from '../../../utils/logger';

interface EmbeddingJobStatus {
  job_id: string;
  total: number;
  processed: number;
  successful: number;
  failed: number;
  running: boolean;
  started_at: string;
  completed_at: string | null;
  progress_percent: number;
}

const EmbeddingControlPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [currentJob, setCurrentJob] = useState<EmbeddingJobStatus | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingMissing, setGeneratingMissing] = useState(false);
  const [pollInterval, setPollInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  const startPolling = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await apiCallJSON(`/api/embeddings/job-status/${jobId}`);
        setCurrentJob(status);

        if (!status.running) {
          clearInterval(interval);
          setPollInterval(null);
        }
        } catch (err) {
        logger.error('EMBEDDINGS', `Failed to fetch job status: ${String(err)}`);
      }
    }, 2000);

    setPollInterval(interval);
  };

  const handleGenerateAll = async () => {
    setGeneratingAll(true);
    try {
      const result = await apiCallJSON('/api/embeddings/generate-all', {
        method: 'POST',
      });

      setCurrentJob({
        job_id: result.job_id,
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        running: true,
        started_at: new Date().toISOString(),
        completed_at: null,
        progress_percent: 0,
      });

      startPolling(result.job_id);
    } catch (err) {
      logger.error('EMBEDDINGS', `Failed to start embedding generation: ${String(err)}`);
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleGenerateMissing = async () => {
    setGeneratingMissing(true);
    try {
      const result = await apiCallJSON('/api/embeddings/generate-missing', {
        method: 'POST',
      });

      setCurrentJob({
        job_id: result.job_id,
        total: 0,
        processed: 0,
        successful: 0,
        failed: 0,
        running: true,
        started_at: new Date().toISOString(),
        completed_at: null,
        progress_percent: 0,
      });

      startPolling(result.job_id);
    } catch (err) {
      logger.error('EMBEDDINGS', `Failed to start embedding generation: ${String(err)}`);
    } finally {
      setGeneratingMissing(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full bg-blue-50 border border-blue-200 rounded-xl p-4 hover:bg-blue-100 transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-blue-900">Face Embeddings</h3>
                <p className="text-sm text-blue-700">
                  {currentJob?.running
                    ? `Generating embeddings... ${currentJob.progress_percent}%`
                    : currentJob?.successful
                    ? `Last job completed: ${currentJob.successful} successful, ${currentJob.failed} failed`
                    : 'Generate face embeddings for facial recognition'}
                </p>
              </div>
            </div>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.3 }}
            >
              <Zap className="w-5 h-5 text-blue-700" />
            </motion.div>
          </div>
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-blue-50 border border-t-0 border-blue-200 rounded-b-xl p-4 space-y-4">
                {/* Current Job Status */}
                {currentJob && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-lg border border-blue-200 p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      {currentJob.running ? (
                        <>
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          <span className="font-medium text-blue-900">Processing embeddings...</span>
                        </>
                      ) : currentJob.failed === 0 ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <span className="font-medium text-green-900">Completed successfully</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-orange-600" />
                          <span className="font-medium text-orange-900">Completed with issues</span>
                        </>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="w-full bg-secondary-200 rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${currentJob.progress_percent}%` }}
                          transition={{ duration: 0.3 }}
                          className="h-full bg-blue-600"
                        />
                      </div>
                      <p className="text-sm text-secondary-600">
                        {currentJob.processed} of {currentJob.total} processed (
                        {currentJob.progress_percent}%)
                      </p>
                    </div>

                    {/* Statistics */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-green-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-green-600">
                          {currentJob.successful}
                        </p>
                        <p className="text-xs text-green-700">Successful</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-red-600">
                          {currentJob.failed}
                        </p>
                        <p className="text-xs text-red-700">Failed</p>
                      </div>
                      <div className="bg-secondary-100 rounded-lg p-2 text-center">
                        <p className="text-lg font-bold text-secondary-700">
                          {currentJob.total}
                        </p>
                        <p className="text-xs text-secondary-600">Total</p>
                      </div>
                    </div>

                    {!currentJob.running && (
                      <button
                        onClick={() => setCurrentJob(null)}
                        className="w-full text-sm text-blue-700 hover:text-blue-900 py-2"
                      >
                        Dismiss
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={handleGenerateAll}
                    disabled={
                      generatingAll ||
                      generatingMissing ||
                      currentJob?.running === true
                    }
                  >
                    {generatingAll ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate Embeddings (All Students)
                      </>
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={handleGenerateMissing}
                    disabled={
                      generatingAll ||
                      generatingMissing ||
                      currentJob?.running === true
                    }
                  >
                    {generatingMissing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate Embeddings (Missing Only)
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-secondary-600 text-center">
                  Processing runs in the background. You can close this panel and it will continue.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
};

export default EmbeddingControlPanel;
